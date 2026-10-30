import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TextMode } from '@/types/adb';

/** Only non-sensitive preferences live here; the ADB key is handled natively (Keystore-wrapped). */
export interface Settings {
  savedDevice: { host: string; port: string } | null;
  haptics: boolean;
  textMode: TextMode;
  keepHistory: boolean;
  history: string[];
  theme: 'system' | 'light' | 'dark';
  model: 'hy300' | 'hy320';
}

export const DEFAULT_SETTINGS: Settings = {
  savedDevice: null,
  haptics: true,
  textMode: 'whole',
  keepHistory: true,
  history: [],
  theme: 'dark',
  model: 'hy300',
};

const KEY = 'remote-adb-controller/settings/v1';
export const HISTORY_LIMIT = 8;

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export const pushHistory = (history: string[], text: string) =>
  [text, ...history.filter((h) => h !== text)].slice(0, HISTORY_LIMIT);
