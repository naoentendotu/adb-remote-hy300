import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { AdbClient } from '@/services/adb/AdbClient';
import { MockAdbTransport } from '@/services/adb/MockAdbTransport';
import { nativeAdbTransport } from '@/services/adb/NativeAdbTransport';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '@/services/storage/SettingsStorage';
import type { InstalledApp } from '@/types/adb';

interface AdbContext {
  client: AdbClient;
  demo: boolean;
  setDemo: (demo: boolean) => void;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  tick: () => void;
  /** Projector apps; null until loaded. Loaded once per connection, then only by reloadApps. */
  apps: InstalledApp[] | null;
  appsLoading: boolean;
  reloadApps: () => Promise<void>;
}

const Ctx = createContext<AdbContext | null>(null);

/** Placeholder address for the simulated projector; any valid LAN IP works with the mock transport. */
const DEMO_HOST = '10.0.0.2';

export function AdbProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const client = useMemo(() => new AdbClient(demo ? new MockAdbTransport() : nativeAdbTransport), [demo]);

  useEffect(() => () => void client.disconnect(), [client]);
  useEffect(() => {
    // Demo needs no address: turning it on connects the simulated projector straight away.
    if (demo) client.connect(DEMO_HOST, 5555).catch(() => {});
  }, [client, demo]);
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);
  useEffect(() => {
    // Native dialogs and the keyboard follow this; screens read the setting directly (useScheme), so web works too.
    Appearance.setColorScheme?.(settings.theme === 'system' ? 'unspecified' : settings.theme);
  }, [settings.theme]);

  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const reloadApps = useCallback(async () => {
    setAppsLoading(true);
    try {
      setApps(await client.listApps());
    } finally {
      setAppsLoading(false);
    }
  }, [client]);
  useEffect(() => {
    let prev = client.getState().status;
    return client.subscribe(() => {
      const { status } = client.getState();
      if (status === prev) return;
      // A new "Conectar" goes through checking-network; an auto-reconnect comes from reconnecting and keeps the list.
      if (status === 'checking-network') setApps(null);
      if (status === 'connected' && prev !== 'reconnecting') reloadApps().catch(() => {});
      prev = status;
    });
  }, [client, reloadApps]);

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
    () => ({ client, demo, setDemo, settings, updateSettings, tick, apps, appsLoading, reloadApps }),
    [client, demo, settings, updateSettings, tick, apps, appsLoading, reloadApps],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Settings only, without subscribing to connection state (cheap for theming). */
export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings outside AdbProvider');
  return ctx.settings;
}

export function useAdbConnection() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdbConnection outside AdbProvider');
  const state = useSyncExternalStore(ctx.client.subscribe, ctx.client.getState);
  return { ...ctx, state };
}
