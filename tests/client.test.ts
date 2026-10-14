import { AdbClient, type ClientOptions } from '@/services/adb/AdbClient';
import { AdbError } from '@/services/adb/AdbErrors';
import { MockAdbTransport } from '@/services/adb/MockAdbTransport';
import type { ConnectionStatus } from '@/types/adb';

const FAST: ClientOptions = {
  probeTimeoutMs: 100,
  connectTimeoutMs: 100,
  socketTimeoutMs: 100,
  authHintMs: 30,
  heartbeatMs: 60_000,
  reconnectDelaysMs: [10, 10],
};

function setup(behavior: ConstructorParameters<typeof MockAdbTransport>[0] = {}) {
  const transport = new MockAdbTransport({ connectDelayMs: 5, execDelayMs: 2, ...behavior });
  const client = new AdbClient(transport, FAST);
  const statuses: ConnectionStatus[] = [];
  client.subscribe((s) => {
    if (statuses[statuses.length - 1] !== s.status) statuses.push(s.status);
  });
  return { transport, client, statuses };
}

const waitFor = async (cond: () => boolean, ms = 1000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

afterEach(() => jest.useRealTimers());

describe('connection', () => {
  it('goes checking → connecting → connected and reads the HY300 info', async () => {
    const { client, statuses } = setup();
    await client.connect('192.168.0.10', '5555');
    expect(statuses).toEqual(['checking-network', 'connecting', 'connected']);
    expect(client.getState().info).toEqual({
      uid: 0, isRoot: true, model: 'HY300', sdk: 28, screen: { width: 1280, height: 720 }, irDevice: '/dev/input/event0',
    });
    await client.disconnect();
  });

  it('shows awaiting-auth while the handshake is pending, then connects once authorized', async () => {
    const { client, statuses } = setup({ connectDelayMs: 120 });
    await client.connect('192.168.0.10', 5555);
    expect(statuses).toEqual(['checking-network', 'connecting', 'awaiting-auth', 'connected']);
    await client.disconnect();
  });

  it('reports an auth rejection as an error, not as connected', async () => {
    const { client, statuses } = setup({ connectError: 'AUTH_REJECTED' });
    await expect(client.connect('192.168.0.10', 5555)).rejects.toMatchObject({ code: 'AUTH_REJECTED' });
    expect(statuses).not.toContain('connected');
    expect(client.getState()).toMatchObject({ status: 'error', error: { code: 'AUTH_REJECTED' } });
  });

  it('separates "port closed" from "port open but no ADB"', async () => {
    const refused = setup({ probeError: 'REFUSED' });
    await expect(refused.client.connect('192.168.0.10', 5555)).rejects.toMatchObject({ code: 'REFUSED' });
    expect(refused.statuses).toEqual(['checking-network', 'error']);

    const noAdb = setup({ connectError: 'PROTOCOL' });
    expect(await noAdb.client.test('192.168.0.10', '5555')).toMatchObject({ tcp: true, adb: false });
  });

  it('times out', async () => {
    const { client } = setup({ probeError: 'TIMEOUT' });
    await expect(client.connect('192.168.0.10', 5555)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('rejects invalid addresses without touching the network', async () => {
    const { client, transport } = setup();
    const probe = jest.spyOn(transport, 'probe');
    await expect(client.connect('8.8.8.8', 5555)).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    await expect(client.connect('192.168.0.10', '99999')).rejects.toMatchObject({ code: 'INVALID_ADDRESS' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent connects to the same target', async () => {
    const { client, transport } = setup({ connectDelayMs: 30 });
    const connect = jest.spyOn(transport, 'connect');
    const a = client.connect('192.168.0.10', 5555);
    const b = client.connect('192.168.0.10', 5555);
    expect(b).toBe(a);
    await Promise.all([a, b]);
    await client.connect('192.168.0.10', 5555); // already connected: no-op
    expect(connect).toHaveBeenCalledTimes(1);
    await client.disconnect();
  });

  it('a newer connect to another address supersedes the older one', async () => {
    const { client } = setup({ connectDelayMs: 30 });
    const first = client.connect('192.168.0.10', 5555);
    const second = client.connect('192.168.0.20', 5555);
    await expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    await second;
    expect(client.getState()).toMatchObject({ status: 'connected', host: '192.168.0.20' });
    await client.disconnect();
  });

  it('cancel during the handshake leaves the client disconnected', async () => {
    const { client, statuses } = setup({ connectDelayMs: 50 });
    const p = client.connect('192.168.0.10', 5555);
    await waitFor(() => client.getState().status === 'connecting');
    await client.disconnect();
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(client.getState().status).toBe('disconnected');
    expect(statuses).not.toContain('connected');
  });
});

describe('commands', () => {
  it('sends D-pad keys through the IR evdev node and recents through input keyevent', async () => {
    const { client, transport } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.commands = [];
    await client.pressKey('up');
    await client.pressKey('recents');
    expect(transport.commands[0]).toMatch(/^print -n '.*' > \/dev\/input\/event0$/);
    expect(transport.commands[1]).toBe('input keyevent 187');
    await client.disconnect();
  });

  it('falls back to input keyevent when the IR node is not writable', async () => {
    const { client, transport } = setup({ exec: (c) => (c.startsWith('test -w') ? { stdout: '', stderr: '', exitCode: 1 } : undefined) });
    await client.connect('192.168.0.10', 5555);
    expect(client.getState().info?.irDevice).toBeNull();
    transport.commands = [];
    await client.pressKey('up');
    expect(transport.commands).toEqual(['input keyevent 19']);
    await client.disconnect();
  });

  it('refuses commands when not connected', async () => {
    const { client } = setup();
    await expect(client.pressKey('home')).rejects.toMatchObject({ code: 'NOT_CONNECTED' });
  });

  it('serializes concurrent commands in call order', async () => {
    const { client, transport } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.commands = [];
    await Promise.all([client.pressKey('left'), client.sendText('a b', 'whole'), client.tap(0.5, 0.5), client.pressKey('recents')]);
    expect(transport.commands.slice(1)).toEqual(["input text 'a%sb'", 'input tap 640 360', 'input keyevent 187']);
    await client.disconnect();
  });

  it('rejects unsupported text before sending anything', async () => {
    const { client, transport } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.commands = [];
    await expect(client.sendText('ok ação', 'whole')).rejects.toMatchObject({ code: 'UNSUPPORTED_TEXT' });
    expect(transport.commands).toEqual([]);
    await client.disconnect();
  });

  it('maps a non-zero exit code to COMMAND_FAILED without dropping the session', async () => {
    const { client } = setup({ exec: (c) => (c.startsWith('input tap') ? { stdout: '', stderr: 'boom', exitCode: 1 } : undefined) });
    await client.connect('192.168.0.10', 5555);
    await expect(client.tap(0, 0)).rejects.toMatchObject({ code: 'COMMAND_FAILED', message: 'boom' });
    expect(client.getState().status).toBe('connected');
    await client.disconnect();
  });

  it('maps normalized touchpad coordinates to the projector resolution', async () => {
    const { client, transport } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.commands = [];
    await client.swipe(0, 0, 1, 1, 10_000);
    expect(transport.commands).toEqual(['input swipe 0 0 1279 719 2000']);
    await client.disconnect();
  });
});

describe('link loss', () => {
  it('Wi-Fi loss → reconnecting → error when the network stays down', async () => {
    const { client, transport, statuses } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.dropNetwork();
    await expect(client.pressKey('up')).rejects.toBeInstanceOf(AdbError);
    await waitFor(() => client.getState().status === 'error');
    expect(statuses.slice(-2)).toEqual(['reconnecting', 'error']);
    expect(client.getState().error?.code).toBe('CONNECTION_LOST');
  });

  it('reconnects when the network comes back', async () => {
    const { client, transport } = setup();
    await client.connect('192.168.0.10', 5555);
    transport.dropNetwork();
    await expect(client.pressKey('up')).rejects.toMatchObject({ code: 'CONNECTION_LOST' });
    transport.restoreNetwork();
    await waitFor(() => client.getState().status === 'connected');
    await client.pressKey('down');
    await client.disconnect();
  });

  it('disconnect during a command cancels it and does not trigger a reconnect', async () => {
    const { client, statuses } = setup({ execDelayMs: 30 });
    await client.connect('192.168.0.10', 5555);
    const p = client.sendText('hello', 'whole');
    await new Promise((r) => setTimeout(r, 5));
    await client.disconnect();
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' });
    await new Promise((r) => setTimeout(r, 50));
    expect(statuses).not.toContain('reconnecting');
    expect(client.getState().status).toBe('disconnected');
  });

  it('heartbeat detects a silent drop while idle', async () => {
    const transport = new MockAdbTransport({ connectDelayMs: 1, execDelayMs: 1 });
    const client = new AdbClient(transport, { ...FAST, heartbeatMs: 20 });
    await client.connect('192.168.0.10', 5555);
    transport.dropNetwork();
    await waitFor(() => client.getState().status === 'error');
  });
});
