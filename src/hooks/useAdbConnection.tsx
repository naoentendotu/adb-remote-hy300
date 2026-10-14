import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

import { AdbClient } from '@/services/adb/AdbClient';
import { MockAdbTransport } from '@/services/adb/MockAdbTransport';
import { nativeAdbTransport } from '@/services/adb/NativeAdbTransport';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/services/storage/SettingsStorage';

interface AdbContext {
  client: AdbClient;
  demo: boolean;
  setDemo: (demo: boolean) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  tick: () => void;
}

const Ctx = createContext<AdbContext | null>(null);

export function AdbProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const client = useMemo(() => new AdbClient(demo ? new MockAdbTransport() : nativeAdbTransport), [demo]);

  useEffect(() => () => void client.disconnect(), [client]);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next).catch(() => {});
      return next;
    });
  }, []);

  const tick = useCallback(() => {
    if (settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [settings.haptics]);

  const value = useMemo(
    () => ({ client, demo, setDemo, settings, updateSettings, tick }),
    [client, demo, settings, updateSettings, tick],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdbConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdbConnection outside AdbProvider');
  const state = useSyncExternalStore(ctx.client.subscribe, ctx.client.getState);
  return { ...ctx, state };
}
