import { NativeModule, requireNativeModule } from 'expo';

declare class AdbBridgeModule extends NativeModule {
  probe(host: string, port: number, timeoutMs: number): Promise<void>;
  connect(host: string, port: number, connectTimeoutMs: number, socketTimeoutMs: number): Promise<void>;
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  disconnect(): Promise<void>;
  resetKey(): Promise<void>;
}

export default requireNativeModule<AdbBridgeModule>('AdbBridge');
