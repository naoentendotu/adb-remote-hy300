import type { ConnectionStatus } from '@/types/adb';

export const colors = {
  background: '#111315',
  surface: '#1A1D21',
  surfaceHigh: '#252A2F',
  surfacePressed: '#323840',
  outline: '#3A4047',
  text: '#E6E8EB',
  textMuted: '#A0A7AF',
  primary: '#A8C7FA',
  onPrimary: '#0A2A55',
  success: '#7DD99B',
  warning: '#F2C46D',
  danger: '#F2A39B',
};

export const radius = { sm: 10, md: 16, lg: 28, full: 999 };
export const space = (n: number) => n * 4;

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: 'Desconectado',
  'checking-network': 'Verificando rede',
  connecting: 'Conectando',
  'awaiting-auth': 'Aguardando autorização ADB',
  connected: 'Conectado e autenticado',
  reconnecting: 'Reconectando',
  error: 'Erro de conexão',
};

export const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: colors.textMuted,
  'checking-network': colors.warning,
  connecting: colors.warning,
  'awaiting-auth': colors.warning,
  connected: colors.success,
  reconnecting: colors.warning,
  error: colors.danger,
};
