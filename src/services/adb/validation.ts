/** Returns an error message, or null when the address is acceptable. LAN/loopback IPv4 only: ADB must never cross the internet. */
export function validateHost(host: string): string | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
  if (!m) return 'Informe um IPv4 no formato 192.168.0.10.';
  const octets = m.slice(1).map(Number);
  const [a, b] = octets;
  if (octets.some((n) => n > 255) || m.slice(1).some((s) => s.length > 1 && s.startsWith('0'))) {
    return 'Endereço IPv4 inválido.';
  }
  const isPrivate =
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 127;
  if (!isPrivate) return 'Use um endereço da rede local (10.x, 172.16–31.x, 192.168.x). ADB não deve ser exposto à internet.';
  return null;
}

export function parsePort(port: string): number | null {
  if (!/^\d{1,5}$/.test(port.trim())) return null;
  const n = Number(port);
  return n >= 1 && n <= 65535 ? n : null;
}
