import type { ExecResult } from '@/types/adb';

import { AdbError, type AdbErrorCode } from './AdbErrors';
import type { AdbTransport } from './AdbTransport';

export interface MockBehavior {
  probeError?: AdbErrorCode;
  connectError?: AdbErrorCode;
  connectDelayMs: number;
  execDelayMs: number;
  /** Overrides the canned replies; return undefined to fall back to them. */
  exec?: (command: string) => ExecResult | undefined;
}

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Replies modelled on what the real HY300 returned during the feasibility probe. */
function hy300Reply(command: string): ExecResult {
  if (command.startsWith('id -u')) {
    return ok(
      '0\nHY300\n28\nPhysical size: 1024x600\nOverride size: 1280x720\n---\n' +
        'I: Bus=0019\nN: Name="ff200010.pwm"\nH: Handlers=event0 dmcfreq keychord cpufreq\n\n' +
        'I: Bus=0019\nN: Name="rk29-keypad"\nH: Handlers=event1 dmcfreq keychord cpufreq\n',
    );
  }
  if (command.startsWith('test -w')) return ok('w\n');
  return ok();
}

/**
 * In-memory ADB used by demo mode and by the tests. It never touches the network.
 * `commands` records every shell command the client produced.
 */
export class MockAdbTransport implements AdbTransport {
  commands: string[] = [];
  connected = false;
  behavior: MockBehavior;

  constructor(behavior: Partial<MockBehavior> = {}) {
    this.behavior = { connectDelayMs: 400, execDelayMs: 30, ...behavior };
  }

  async probe() {
    await sleep(5);
    if (this.networkDown) throw new AdbError('UNREACHABLE');
    if (this.behavior.probeError) throw new AdbError(this.behavior.probeError);
  }

  async connect() {
    await sleep(this.behavior.connectDelayMs);
    if (this.networkDown) throw new AdbError('UNREACHABLE');
    if (this.behavior.connectError) throw new AdbError(this.behavior.connectError);
    this.connected = true;
  }

  async exec(command: string) {
    if (!this.connected) throw new AdbError('NOT_CONNECTED');
    this.commands.push(command);
    await sleep(this.behavior.execDelayMs);
    if (!this.connected) throw new AdbError('CANCELLED');
    if (this.networkDown) throw new AdbError('CONNECTION_LOST');
    return this.behavior.exec?.(command) ?? hy300Reply(command);
  }

  async disconnect() {
    this.connected = false;
  }

  async resetKey() {
    this.connected = false;
  }

  /** Simulates Wi-Fi loss: commands on the open session and new connections fail until `restoreNetwork`. */
  dropNetwork() {
    this.networkDown = true;
  }

  restoreNetwork() {
    this.networkDown = false;
  }

  private networkDown = false;
}
