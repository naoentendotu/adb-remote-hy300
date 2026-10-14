package dev.hy300.adbbridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import dadb.AdbKeyPair
import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.interfaces.RSAPublicKey
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The ADB RSA identity of this phone. dadb signs the AUTH token with a raw private-key RSA operation,
 * which the Android Keystore cannot perform, so the RSA key lives in app memory and is stored on disk
 * only encrypted with a non-exportable AES-GCM key held by the Android Keystore.
 */
internal object AdbKeys {
  private const val PREFS = "adb_bridge_keys"
  private const val WRAP_ALIAS = "adb_bridge_wrap"
  private const val KEY_BITS = 2048
  private const val KEY_WORDS = KEY_BITS / 32

  fun load(context: Context): AdbKeyPair {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val wrapped = prefs.getString("priv", null)
    val pub = prefs.getString("pub", null)
    if (wrapped != null && pub != null) {
      try {
        val privateKey = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(unwrap(wrapped)))
        return AdbKeyPair(privateKey, adbPublicKeyBytes(pub))
      } catch (_: Exception) {
        // Keystore entry lost (e.g. app data restored on another phone): fall through and make a new identity.
      }
    }
    val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(KEY_BITS) }.genKeyPair()
    val pubLine = Base64.encodeToString(toAdbFormat(pair.public as RSAPublicKey), Base64.NO_WRAP) + " remote-adb-controller"
    prefs.edit().putString("priv", wrap(pair.private.encoded)).putString("pub", pubLine).apply()
    return AdbKeyPair(pair.private, adbPublicKeyBytes(pubLine))
  }

  fun reset(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(WRAP_ALIAS)
  }

  // adbd expects the public key line NUL-terminated (same as dadb's own file reader).
  private fun adbPublicKeyBytes(line: String) = line.toByteArray() + 0

  private fun wrapKey(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getKey(WRAP_ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(WRAP_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .build()
    )
    return gen.generateKey()
  }

  private fun wrap(data: ByteArray): String {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.ENCRYPT_MODE, wrapKey())
    return b64(c.iv) + ":" + b64(c.doFinal(data))
  }

  private fun unwrap(value: String): ByteArray {
    val (iv, ct) = value.split(":")
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, unb64(iv)))
    return c.doFinal(unb64(ct))
  }

  private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
  private fun unb64(s: String) = Base64.decode(s, Base64.NO_WRAP)

  // The RSAPublicKey struct adbd stores in adb_keys. Ported from dadb's AdbKeyPair
  // (Apache-2.0, mobile.dev), which is private there; originally from cgutman/AdbLib.
  private fun toAdbFormat(pubkey: RSAPublicKey): ByteArray {
    val r32 = BigInteger.ZERO.setBit(32)
    var n = pubkey.modulus
    val r = BigInteger.ZERO.setBit(KEY_WORDS * 32)
    var rr = r.modPow(BigInteger.valueOf(2), n)
    val n0inv = n.remainder(r32).modInverse(r32)
    val myN = IntArray(KEY_WORDS)
    val myRr = IntArray(KEY_WORDS)
    for (i in 0 until KEY_WORDS) {
      var res = rr.divideAndRemainder(r32)
      rr = res[0]
      myRr[i] = res[1].toInt()
      res = n.divideAndRemainder(r32)
      n = res[0]
      myN[i] = res[1].toInt()
    }
    val buf = ByteBuffer.allocate(524).order(ByteOrder.LITTLE_ENDIAN)
    buf.putInt(KEY_WORDS)
    buf.putInt(n0inv.negate().toInt())
    for (i in myN) buf.putInt(i)
    for (i in myRr) buf.putInt(i)
    buf.putInt(pubkey.publicExponent.toInt())
    return buf.array()
  }
}
