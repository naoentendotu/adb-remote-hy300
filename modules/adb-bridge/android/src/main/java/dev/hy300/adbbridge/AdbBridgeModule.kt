package dev.hy300.adbbridge

import dadb.AdbAuthException
import dadb.AdbConnectionClosedException
import dadb.AdbTimeoutException
import dadb.Dadb
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.EOFException
import java.net.ConnectException
import java.net.InetSocketAddress
import java.net.NoRouteToHostException
import java.net.Socket
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Thin bridge over dadb. All policy (state machine, retries, command building) lives in TypeScript;
 * this module only opens/closes the ADB session and runs shell commands on a background pool.
 */
class AdbBridgeModule : Module() {
  private val io = Executors.newCachedThreadPool()

  @Volatile private var dadb: Dadb? = null

  // Bumped by connect/disconnect so a slow handshake that finishes after a cancel is discarded.
  private val generation = AtomicInteger()

  override fun definition() = ModuleDefinition {
    Name("AdbBridge")

    // Plain TCP reachability. Says nothing about whether ADB works on that port.
    AsyncFunction("probe") { host: String, port: Int, timeoutMs: Int, promise: Promise ->
      io.execute {
        try {
          Socket().use { it.connect(InetSocketAddress(host, port), timeoutMs) }
          promise.resolve(null)
        } catch (e: Throwable) {
          promise.reject(mapError(e))
        }
      }
    }

    // Full ADB handshake (CNXN + AUTH when the device asks for it) plus one shell round trip.
    // Resolves only when the command channel is proven to work.
    AsyncFunction("connect") { host: String, port: Int, connectTimeoutMs: Int, socketTimeoutMs: Int, promise: Promise ->
      val gen = generation.incrementAndGet()
      closeCurrent()
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(CodedException("ERR_PROTOCOL", "React context unavailable", null))
        return@AsyncFunction
      }
      io.execute {
        var candidate: Dadb? = null
        try {
          candidate = Dadb.create(host, port, AdbKeys.load(context), connectTimeoutMs, socketTimeoutMs, true)
          val response = candidate.shell("echo adb-ok")
          if (response.output.trim() != "adb-ok") {
            throw CodedException("ERR_PROTOCOL", "Unexpected shell reply", null)
          }
          if (generation.get() != gen) {
            candidate.close()
            promise.reject(CodedException("ERR_CANCELLED", "Connection cancelled", null))
            return@execute
          }
          dadb = candidate
          promise.resolve(null)
        } catch (e: Throwable) {
          try { candidate?.close() } catch (_: Throwable) {}
          promise.reject(mapError(e))
        }
      }
    }

    AsyncFunction("exec") { command: String, promise: Promise ->
      val current = dadb
      if (current == null) {
        promise.reject(CodedException("ERR_NOT_CONNECTED", "Not connected", null))
        return@AsyncFunction
      }
      io.execute {
        try {
          val r = current.shell(command)
          promise.resolve(mapOf("stdout" to r.output, "stderr" to r.errorOutput, "exitCode" to r.exitCode))
        } catch (e: Throwable) {
          promise.reject(mapError(e))
        }
      }
    }

    AsyncFunction("disconnect") {
      generation.incrementAndGet()
      closeCurrent()
    }

    // Forget this phone's ADB identity; the projector will ask for authorization again (if it enforces it).
    AsyncFunction("resetKey") {
      generation.incrementAndGet()
      closeCurrent()
      appContext.reactContext?.let { AdbKeys.reset(it) }
    }

    OnDestroy {
      generation.incrementAndGet()
      closeCurrent()
      io.shutdownNow()
    }
  }

  private fun closeCurrent() {
    val current = dadb
    dadb = null
    try { current?.close() } catch (_: Throwable) {}
  }

  private fun mapError(e: Throwable): CodedException {
    if (e is CodedException) return e
    val chain = generateSequence(e) { it.cause }.toList()
    val code = when {
      chain.any { it is AdbAuthException } -> "ERR_AUTH"
      chain.any { it is ConnectException && it.message.orEmpty().contains("ECONNREFUSED") } -> "ERR_REFUSED"
      chain.any { it is SocketTimeoutException || it is AdbTimeoutException } -> "ERR_TIMEOUT"
      chain.any { it is ConnectException || it is NoRouteToHostException || it is UnknownHostException } -> "ERR_UNREACHABLE"
      chain.any { it is AdbConnectionClosedException || it is SocketException || it is EOFException } -> "ERR_CLOSED"
      else -> "ERR_PROTOCOL"
    }
    // Messages come from java.net/dadb and never contain key material.
    return CodedException(code, e.message ?: e.javaClass.simpleName, e)
  }
}
