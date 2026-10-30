import { useAdbConnection } from '@/hooks/useAdbConnection';

/** Connects and remembers the projector that answered. Resolves false on failure (the error is in client state). */
export function useConnect() {
  const { client, updateSettings } = useAdbConnection();
  return (host: string, port: string) =>
    client.connect(host, port).then(
      () => {
        updateSettings({ savedDevice: { host: host.trim(), port: port.trim() } });
        return true;
      },
      () => false,
    );
}
