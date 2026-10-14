import type { ConnectionStatus, DeviceInfo, ExecResult, RemoteKey, TextMode } from '@/types/adb';

import {
  FOREGROUND_COMMAND,
  IR_DEVICE_NAME,
  SLEEP_STATUS_COMMAND,
  cancelSleepCommand,
  forceStopCommand,
  launchAppCommand,
  parseForegroundPackage,
  scheduleSleepCommand,
  storeSearchCommand,
  IR_LINUX_KEYCODES,
  evdevLongPressCommand,
  evdevPressCommand,
  inputTextCommands,
  keyEventCommand,
  parseInputDevices,
  parseWmSize,
  swipeCommand,
  tapCommand,
} from './AdbCommands';
import { AdbError, LINK_ERRORS, toAdbError } from './AdbErrors';
import type { AdbTransport } from './AdbTransport';
import { parsePort, validateHost } from './validation';

export interface ClientState {
  status: ConnectionStatus;
  host?: string;
  port?: number;
  info?: DeviceInfo;
  error?: AdbError;
  /** Round trip of the last heartbeat/ping, in ms. */
  latencyMs?: number;
}

export interface ClientOptions {
  probeTimeoutMs: number;
  connectTimeoutMs: number;
  /** Read timeout of the ADB socket; also bounds how long we wait for the user to authorize. */
  socketTimeoutMs: number;
  /** After the TCP probe succeeds, a handshake still pending after this long is shown as "awaiting authorization". */
  authHintMs: number;
  heartbeatMs: number;
  reconnectDelaysMs: number[];
}

export const DEFAULT_OPTIONS: ClientOptions = {
  probeTimeoutMs: 3000,
  connectTimeoutMs: 5000,
  socketTimeoutMs: 20000,
  authHintMs: 1500,
  heartbeatMs: 5000,
  reconnectDelaysMs: [500, 1500, 3000],
};

const IN_PROGRESS: ConnectionStatus[] = ['checking-network', 'connecting', 'awaiting-auth', 'reconnecting'];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AdbClient {
  private state: ClientState = { status: 'disconnected' };
  private listeners = new Set<(s: ClientState) => void>();
  /** Bumped on every connect/disconnect; async work started under an older value is discarded. */
  private session = 0;
  private pendingConnect?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeat?: ReturnType<typeof setInterval>;

  constructor(
    private readonly transport: AdbTransport,
    private readonly opts: ClientOptions = DEFAULT_OPTIONS,
  ) {}

  getState = () => this.state;

  subscribe = (listener: (s: ClientState) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<ClientState>, replace = false) {
    this.state = replace ? (patch as ClientState) : { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  connect(host: string, portText: string | number): Promise<void> {
    host = host.trim();
    const hostError = validateHost(host);
    const port = parsePort(String(portText));
    if (hostError || port === null) {
      const error = new AdbError('INVALID_ADDRESS', hostError ?? 'Porta inválida (1–65535).');
      this.set({ status: 'error', host, error }, true);
      return Promise.reject(error);
    }
    const sameTarget = this.state.host === host && this.state.port === port;
    if (sameTarget && this.pendingConnect && IN_PROGRESS.includes(this.state.status)) return this.pendingConnect;
    if (sameTarget && this.state.status === 'connected') return Promise.resolve();

    const id = ++this.session;
    this.stopHeartbeat();
    this.set({ status: 'checking-network', host, port }, true);
    const run = this.establish(id, host, port).finally(() => {
      if (this.pendingConnect === run) this.pendingConnect = undefined;
    });
    this.pendingConnect = run;
    return run;
  }

  private async establish(id: number, host: string, port: number) {
    const live = () => {
      if (id !== this.session) throw new AdbError('CANCELLED');
    };
    try {
      await this.transport.disconnect().catch(() => {});
      live();
      await this.transport.probe(host, port, this.opts.probeTimeoutMs);
      live();
      this.set({ status: 'connecting' });
      const hint = setTimeout(() => id === this.session && this.set({ status: 'awaiting-auth' }), this.opts.authHintMs);
      try {
        await this.transport.connect(host, port, this.opts.connectTimeoutMs, this.opts.socketTimeoutMs);
      } finally {
        clearTimeout(hint);
      }
      live();
      const info = await this.readDeviceInfo();
      live();
      this.set({ status: 'connected', info });
      this.startHeartbeat(id);
    } catch (e) {
      if (id !== this.session) throw new AdbError('CANCELLED');
      const error = toAdbError(e);
      this.set({ status: 'error', error });
      await this.transport.disconnect().catch(() => {});
      throw error;
    }
  }

  /** Cancels a connection in progress or closes the session. */
  async disconnect() {
    this.session++;
    this.stopHeartbeat();
    this.pendingConnect = undefined;
    const { host, port } = this.state;
    this.set({ status: 'disconnected', host, port }, true);
    await this.transport.disconnect().catch(() => {});
  }

  /** "Testar conexão": reports TCP and ADB separately without changing the current session. */
  async test(host: string, portText: string): Promise<{ tcp: boolean; adb: boolean; error?: AdbError }> {
    const hostError = validateHost(host.trim());
    const port = parsePort(portText);
    if (hostError || port === null) {
      return { tcp: false, adb: false, error: new AdbError('INVALID_ADDRESS', hostError ?? 'Porta inválida (1–65535).') };
    }
    if (this.state.status === 'connected' && this.state.host === host.trim() && this.state.port === port) {
      try {
        await this.ping();
        return { tcp: true, adb: true };
      } catch (e) {
        return { tcp: true, adb: false, error: toAdbError(e) };
      }
    }
    if (this.state.status !== 'disconnected' && this.state.status !== 'error') {
      return { tcp: false, adb: false, error: new AdbError('INVALID_ARGUMENT', 'Desconecte antes de testar outro endereço.') };
    }
    try {
      await this.transport.probe(host.trim(), port, this.opts.probeTimeoutMs);
    } catch (e) {
      return { tcp: false, adb: false, error: toAdbError(e) };
    }
    try {
      await this.transport.connect(host.trim(), port, this.opts.connectTimeoutMs, this.opts.socketTimeoutMs);
      return { tcp: true, adb: true };
    } catch (e) {
      return { tcp: true, adb: false, error: toAdbError(e) };
    } finally {
      await this.transport.disconnect().catch(() => {});
    }
  }

  // ---- commands -------------------------------------------------------------------------

  pressKey(key: RemoteKey) {
    return this.run(() => {
      const code = IR_LINUX_KEYCODES[key];
      const dev = this.state.info?.irDevice;
      return this.execVoid(dev && code !== undefined ? evdevPressCommand(dev, code) : keyEventCommand(key));
    });
  }

  /** Long press (held ~1 s on the projector), e.g. OK to open context menus. */
  longPressKey(key: RemoteKey) {
    return this.run(() => {
      const code = IR_LINUX_KEYCODES[key];
      const dev = this.state.info?.irDevice;
      return this.execVoid(dev && code !== undefined ? evdevLongPressCommand(dev, code) : keyEventCommand(key, true));
    });
  }

  /** Validates up front so unsupported text fails immediately instead of after earlier chunks were typed. */
  sendText(text: string, mode: TextMode) {
    let commands: string[];
    try {
      commands = inputTextCommands(text, mode);
    } catch (e) {
      return Promise.reject(e);
    }
    // One exec per chunk: each `input` call takes ~1 s and must stay under the socket read timeout.
    return this.run(async () => {
      for (const c of commands) await this.execChecked(c);
    });
  }

  /** Coordinates normalized to 0..1 of the projector screen. */
  tap(nx: number, ny: number) {
    return this.run(() => {
      const [x, y] = this.toScreen(nx, ny);
      return this.execVoid(tapCommand(x, y));
    });
  }

  swipe(nx1: number, ny1: number, nx2: number, ny2: number, durationMs: number) {
    return this.run(() => {
      const [x1, y1] = this.toScreen(nx1, ny1);
      const [x2, y2] = this.toScreen(nx2, ny2);
      const ms = Math.round(Math.min(Math.max(durationMs, 50), 2000));
      return this.execVoid(swipeCommand(x1, y1, x2, y2, ms));
    });
  }

  launchApp(pkg: string) {
    return this.run(() => this.execVoid(launchAppCommand(pkg)));
  }

  /** Force-stops whatever app is on screen (never the launcher) and goes Home. Returns the package closed. */
  closeForegroundApp(protectedPackages: string[]) {
    return this.run(async () => {
      const pkg = parseForegroundPackage((await this.execChecked(FOREGROUND_COMMAND)).stdout);
      if (!pkg || protectedPackages.includes(pkg)) return null;
      await this.execVoid(forceStopCommand(pkg));
      await this.execVoid(keyEventCommand('home'));
      return pkg;
    });
  }

  scheduleSleep(minutes: number) {
    return this.run(() => this.execVoid(scheduleSleepCommand(minutes)));
  }

  cancelSleep() {
    return this.run(() => this.execVoid(cancelSleepCommand()));
  }

  /** Seconds until the projector's sleep timer fires, or null when none is set. */
  sleepRemaining() {
    return this.run(async () => {
      const [due, now] = (await this.execChecked(SLEEP_STATUS_COMMAND)).stdout.trim().split(/s+/).map(Number);
      return now !== undefined && due > now ? due - now : null;
    });
  }

  openStoreSearch(query: string) {
    let cmd: string;
    try {
      cmd = storeSearchCommand(query);
    } catch (e) {
      return Promise.reject(e);
    }
    return this.run(() => this.execVoid(cmd));
  }

  ping() {
    return this.run(async () => {
      const t = Date.now();
      await this.execChecked('echo ok');
      this.set({ latencyMs: Date.now() - t });
    });
  }

  async resetKey() {
    await this.disconnect();
    await this.transport.resetKey();
  }

  private toScreen(nx: number, ny: number): [number, number] {
    const s = this.state.info?.screen;
    if (!s) throw new AdbError('INVALID_ARGUMENT', 'Resolução da tela do projetor desconhecida.');
    const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
    return [Math.round(clamp(nx) * (s.width - 1)), Math.round(clamp(ny) * (s.height - 1))];
  }

  /** Serializes commands; a failed link error starts a reconnect unless the session was cancelled meanwhile. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const id = this.session;
    const task = this.queue.then(async () => {
      if (id !== this.session) throw new AdbError('CANCELLED');
      if (this.state.status !== 'connected') throw new AdbError('NOT_CONNECTED');
      try {
        return await fn();
      } catch (e) {
        if (id !== this.session) throw new AdbError('CANCELLED');
        const error = toAdbError(e);
        if (LINK_ERRORS.has(error.code)) void this.reconnect(id);
        throw error;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  private async execVoid(command: string): Promise<void> {
    await this.execChecked(command);
  }

  private async execChecked(command: string): Promise<ExecResult> {
    const r = await this.transport.exec(command);
    if (r.exitCode !== 0) throw new AdbError('COMMAND_FAILED', (r.stderr || r.stdout).trim().slice(0, 200) || `exit ${r.exitCode}`);
    return r;
  }

  private async readDeviceInfo(): Promise<DeviceInfo> {
    const r = await this.execChecked(
      'id -u; getprop ro.product.model; getprop ro.build.version.sdk; wm size; echo ---; cat /proc/bus/input/devices',
    );
    const [head, devices = ''] = r.stdout.split(/^---$/m);
    const [uid, model, sdk, ...wm] = head.split(/\r?\n/);
    let irDevice = parseInputDevices(devices).find((d) => d.name === IR_DEVICE_NAME)?.path ?? null;
    if (irDevice) {
      const w = await this.transport.exec(`test -w ${irDevice} && echo w`);
      if (w.stdout.trim() !== 'w') irDevice = null;
    }
    return {
      uid: Number(uid),
      isRoot: uid?.trim() === '0',
      model: model?.trim() ?? '',
      sdk: Number(sdk),
      screen: parseWmSize(wm.join('\n')),
      irDevice,
    };
  }

  private async reconnect(id: number) {
    if (id !== this.session || this.state.status === 'reconnecting') return;
    const { host, port } = this.state;
    if (!host || !port) return;
    this.stopHeartbeat();
    this.set({ status: 'reconnecting', error: undefined });
    for (const delay of this.opts.reconnectDelaysMs) {
      await sleep(delay);
      if (id !== this.session) return;
      try {
        await this.transport.disconnect().catch(() => {});
        await this.transport.connect(host, port, this.opts.connectTimeoutMs, this.opts.socketTimeoutMs);
        if (id !== this.session) return;
        this.set({ status: 'connected' });
        this.startHeartbeat(id);
        return;
      } catch {
        // try the next delay
      }
    }
    if (id === this.session) this.set({ status: 'error', error: new AdbError('CONNECTION_LOST') });
  }

  private startHeartbeat(id: number) {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (id === this.session && this.state.status === 'connected') this.ping().catch(() => {});
    }, this.opts.heartbeatMs);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
}
