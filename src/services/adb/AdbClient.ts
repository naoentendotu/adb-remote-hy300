import type { ConnectionStatus, DeviceInfo, ExecResult, InstalledApp, RemoteKey, TextMode } from '@/types/adb';

import {
  FOREGROUND_COMMAND,
  LIST_APPS_COMMAND,
  POWER_OFF_COMMAND,
  START_MOUSE_COMMAND,
  STOP_MOUSE_COMMAND,
  mouseReportCommand,
  parseAppList,
  IR_DEVICE_NAME,
  SLEEP_STATUS_COMMAND,
  parseSleepStatus,
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
  sendText(text: string, mode: TextMode, pasteA = true) {
    let commands: string[];
    try {
      commands = inputTextCommands(text, mode, pasteA);
    } catch (e) {
      return Promise.reject(e);
    }
    // One exec per chunk: each `input` call takes ~1 s and must stay under the socket read timeout.
    return this.run(async () => {
      for (const c of commands) await this.execChecked(c);
    });
  }

  /** Launchable apps with the label and icon the projector itself shows (~3 s). */
  listApps(): Promise<InstalledApp[]> {
    return this.run(async () => parseAppList((await this.execChecked(LIST_APPS_COMMAND)).stdout));
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

  /** Power off now, confirming the projector's own prompt. The connection drops right after. */
  powerOff() {
    return this.run(() => this.execVoid(POWER_OFF_COMMAND));
  }

  /** Shows a mouse cursor on the projector (virtual HID mouse); safe to call again while it runs. */
  startMouse() {
    return this.run(() => this.execVoid(START_MOUSE_COMMAND));
  }

  /** HID reports [buttons, dx, dy, wheel] for the virtual mouse; fails if the mouse is not running. */
  mouse(reports: number[][]) {
    let cmd: string;
    try {
      cmd = mouseReportCommand(reports);
    } catch (e) {
      return Promise.reject(e);
    }
    return this.run(() => this.execVoid(cmd));
  }

  stopMouse() {
    return this.run(() => this.execVoid(STOP_MOUSE_COMMAND));
  }

  /** The projector's sleep timer, or null when none is set. */
  sleepStatus() {
    return this.run(async () => parseSleepStatus((await this.execChecked(SLEEP_STATUS_COMMAND)).stdout));
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
      'id -u; getprop ro.product.model; getprop ro.build.version.sdk; echo ---; cat /proc/bus/input/devices',
    );
    const [head, devices = ''] = r.stdout.split(/^---$/m);
    const [uid, model, sdk] = head.split(/\r?\n/);
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
