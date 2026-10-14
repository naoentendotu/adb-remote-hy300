import type { ExecResult } from '@/types/adb';

/** The only surface that touches the network. AdbClient owns all policy on top of it. */
export interface AdbTransport {
  /** TCP reachability only — an open port is not a working ADB session. */
  probe(host: string, port: number, timeoutMs: number): Promise<void>;
  /** ADB handshake + authentication + one shell round trip. */
  connect(host: string, port: number, connectTimeoutMs: number, socketTimeoutMs: number): Promise<void>;
  exec(command: string): Promise<ExecResult>;
  disconnect(): Promise<void>;
  /** Discards this phone's ADB key so a new one is generated (and must be authorized) next time. */
  resetKey(): Promise<void>;
}
