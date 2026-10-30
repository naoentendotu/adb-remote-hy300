import BellOff from 'lucide-react-native/icons/bell-off';
import Moon from 'lucide-react-native/icons/moon';
import Sun from 'lucide-react-native/icons/sun';
import Vibrate from 'lucide-react-native/icons/vibrate';
import { Button } from 'react-native-ui-lib';

import type { IconName } from '@/components/RemoteButton';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { useColors, useScheme } from '@/theme';

/** Round 44 dp icon button used across the top bars. */
export function TopIcon({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  const colors = useColors();
  return (
    <Button
      round
      style={{ width: 44, height: 44 }}
      backgroundColor="transparent"
      iconSource={uiIcon(icon, color ?? colors.icon, 22)}
      accessibilityLabel={label}
      onPress={onPress}
    />
  );
}

/** Sun / moon: flips between light and dark (also in Configurações). */
export function ThemeToggle() {
  const light = useScheme() === 'light';
  const { updateSettings } = useAdbConnection();
  return (
    <TopIcon
      icon={light ? Sun : Moon}
      label={light ? 'Tema claro. Tocar para o modo noturno' : 'Modo noturno. Tocar para o tema claro'}
      onPress={() => updateSettings({ theme: light ? 'dark' : 'light' })}
    />
  );
}

/** Vibrate / silent: the haptic feedback on remote taps (also in Configurações). */
export function VibrationToggle() {
  const { settings, updateSettings } = useAdbConnection();
  return (
    <TopIcon
      icon={settings.haptics ? Vibrate : BellOff}
      label={settings.haptics ? 'Vibração ligada. Tocar para silencioso' : 'Silencioso. Tocar para vibração'}
      onPress={() => updateSettings({ haptics: !settings.haptics })}
    />
  );
}
