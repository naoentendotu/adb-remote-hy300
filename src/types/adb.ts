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
  screen: { width: number; height: number } | null;
  /** evdev node of the IR receiver when writable: fast key path. null = `input keyevent` fallback. */
  irDevice: string | null;
}
