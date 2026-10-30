export type ConnectionStatus =
  | 'disconnected'
  | 'checking-network'
  | 'connecting'
  | 'awaiting-auth'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type RemoteKey =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'center'
  | 'home'
  | 'back'
  | 'menu'
  | 'recents'
  | 'power'
  | 'volumeUp'
  | 'volumeDown'
  | 'mute'
  | 'del'
  | 'enter';

export type TextMode = 'whole' | 'char';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DeviceInfo {
  uid: number;
  isRoot: boolean;
  model: string;
  sdk: number;
  /** evdev node of the IR receiver when writable: fast key path. null = `input keyevent` fallback. */
  irDevice: string | null;
}

export interface InstalledApp {
  pkg: string;
  label: string;
  /** data: URI of the launcher icon as rendered by the projector. */
  icon: string;
}
