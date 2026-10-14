import { parsePort, validateHost } from '@/services/adb/validation';

describe('validateHost', () => {
  it.each(['192.168.0.10', '10.0.0.5', '172.16.0.1', '172.31.255.254', '127.0.0.1', ' 192.168.0.2 '])('accepts LAN %s', (h) =>
    expect(validateHost(h)).toBeNull(),
  );
  it.each(['8.8.8.8', '172.32.0.1', '200.1.2.3'])('rejects public %s', (h) => expect(validateHost(h)).toMatch(/rede local/));
  it.each(['', 'projetor', '192.168.0', '192.168.0.256', '192.168.010.10', '192.168.0.10:5555', '::1', '1.2.3.4; reboot'])(
    'rejects malformed %s',
    (h) => expect(validateHost(h)).not.toBeNull(),
  );
});

describe('parsePort', () => {
  it('parses valid ports', () => {
    expect(parsePort('5555')).toBe(5555);
    expect(parsePort('1')).toBe(1);
    expect(parsePort('65535')).toBe(65535);
  });
  it.each(['0', '65536', '-1', '55.5', 'abc', '', '123456', '5555; reboot'])('rejects %p', (p) => {
    expect(parsePort(p)).toBeNull();
  });
});
