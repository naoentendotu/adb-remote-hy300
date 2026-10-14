import AdbBridge from '../../../modules/adb-bridge';

import { AdbError, type AdbErrorCode } from './AdbErrors';
import type { AdbTransport } from './AdbTransport';

const CODES: Record<string, AdbErrorCode> = {
  ERR_REFUSED: 'REFUSED',
  ERR_TIMEOUT: 'TIMEOUT',
  ERR_UNREACHABLE: 'UNREACHABLE',
  ERR_AUTH: 'AUTH_REJECTED',
  ERR_CLOSED: 'CONNECTION_LOST',
  ERR_PROTOCOL: 'PROTOCOL',
  ERR_NOT_CONNECTED: 'NOT_CONNECTED',
  ERR_CANCELLED: 'CANCELLED',
};

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new AdbError(CODES[code ?? ''] ?? 'PROTOCOL', (e as Error).message);
  }
};

export const nativeAdbTransport: AdbTransport = {
  probe: (host, port, timeoutMs) => wrap(AdbBridge.probe(host, port, timeoutMs)),
  connect: (host, port, c, s) => wrap(AdbBridge.connect(host, port, c, s)),
  exec: (command) => wrap(AdbBridge.exec(command)),
  disconnect: () => wrap(AdbBridge.disconnect()),
  resetKey: () => wrap(AdbBridge.resetKey()),
};
