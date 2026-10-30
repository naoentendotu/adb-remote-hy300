import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { Colors as UiColors } from 'react-native-ui-lib';

import { useSettings } from '@/hooks/useAdbConnection';
import type { ConnectionStatus } from '@/types/adb';

const dark = {
  background: '#111315',
  surface: '#1A1D21',
  surfaceHigh: '#252A2F',
  surfacePressed: '#323840',
  outline: '#3A4047',
  text: '#E6E8EB',
  textMuted: '#A0A7AF',
  primary: '#A8C7FA',
  onPrimary: '#0A2A55',
  /** Selected item in lists and segmented choices. */
  primaryContainer: '#1F3A5F',
  onPrimaryContainer: '#D3E3FD',
  /** Selected tab pill / chosen preset: high-contrast "ink". */
  ink: '#E6E8EB',
  onInk: '#111315',
  /** Icons on buttons and bars. */
  icon: '#E6E8EB',
  success: '#7DD99B',
  warning: '#F2C46D',
  /** Power and force-stop: text/icon on its own container. */
  danger: '#F2A39B',
  dangerContainer: '#3A2224',
  dangerOutline: '#5A3234',
  /** Only for things that float over content (bottom sheets). */
  shadow: '0px 4px 16px rgba(0, 0, 0, 0.45)',
};

export type Colors = typeof dark;

const light: Colors = {
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceHigh: '#E8EDF4',
  surfacePressed: '#D7DFEA',
  outline: '#C3CBD5',
  text: '#1A1D21',
  textMuted: '#5C646D',
  primary: '#1565D8',
  onPrimary: '#FFFFFF',
  primaryContainer: '#D3E3FD',
  onPrimaryContainer: '#041E49',
  // Light mode: selection and icons carry the primary blue instead of near-black.
  ink: '#1565D8',
  onInk: '#FFFFFF',
  icon: '#1565D8',
  success: '#1E8E3E',
  warning: '#B26A00',
  danger: '#C62828',
  dangerContainer: '#FDECEC',
  dangerOutline: '#F5C2C2',
  shadow: '0px 4px 16px rgba(16, 24, 40, 0.12)',
};

/** Our palette expressed as react-native-ui-lib design tokens, so its components default to the same colours. */
const uiTokens = (c: Colors) => ({
  $backgroundDefault: c.background,
  $backgroundElevated: c.surface,
  $backgroundNeutralLight: c.surfaceHigh,
  $backgroundPrimaryHeavy: c.primary,
  $backgroundPrimaryMedium: c.primary,
  $backgroundDisabled: c.surfaceHigh,
  $textDefault: c.text,
  $textDefaultLight: c.onPrimary,
  $textNeutral: c.textMuted,
  $textNeutralHeavy: c.textMuted,
  $textPrimary: c.primary,
  $textDisabled: c.textMuted,
  $textDanger: c.danger,
  $iconDefault: c.text,
  $iconPrimary: c.primary,
  $outlineDefault: c.outline,
  $outlinePrimary: c.primary,
  $outlineDanger: c.danger,
});
UiColors.loadSchemes({ light: uiTokens(light), dark: uiTokens(dark) });

/** sm: inputs and presets. md: cards and sheets. full: buttons, tabs and pills (the rounded look). */
export const radius = { sm: 14, md: 20, full: 999 };
export const space = (n: number) => n * 4;
/** Screen side margin and the gap between cards. */
export const SCREEN_PAD = 28;
export const CARD_GAP = 16;
/** Technical data (IP, port, latency, uid, device paths). */
export const MONO = 'monospace';

/** The theme picked in settings, or the system's when set to "system". */
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const { theme } = useSettings();
  return (theme === 'system' ? system : theme) === 'light' ? 'light' : 'dark';
}

export function useColors(): Colors {
  return useScheme() === 'light' ? light : dark;
}

/** Styles built from the current palette; pass a module-level `makeStyles` so the memo holds. */
export function useThemed<T>(make: (c: Colors) => T) {
  const colors = useColors();
  const styles = useMemo(() => make(colors), [make, colors]);
  return { colors, styles };
}

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: 'Desconectado',
  'checking-network': 'Verificando rede',
  connecting: 'Conectando',
  'awaiting-auth': 'Aguardando autorização ADB',
  connected: 'Conectado e autenticado',
  reconnecting: 'Reconectando',
  error: 'Erro de conexão',
};

export const STATUS_COLOR: Record<ConnectionStatus, keyof Colors> = {
  disconnected: 'textMuted',
  'checking-network': 'warning',
  connecting: 'warning',
  'awaiting-auth': 'warning',
  connected: 'success',
  reconnecting: 'warning',
  error: 'danger',
};
