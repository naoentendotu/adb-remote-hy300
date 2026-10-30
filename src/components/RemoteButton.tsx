import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Button, Text, View } from 'react-native-ui-lib';

import { uiIcon } from '@/components/uiIcon';
import { useThemed, type Colors } from '@/theme';

export type IconName = LucideIcon;

interface Props {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  variant?: 'tonal' | 'filled' | 'plain';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RemoteButton({ icon, label, accessibilityLabel, variant = 'tonal', size = 64, disabled, style, ...handlers }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const filled = variant === 'filled';
  return (
    <View center gap-s2 style={style}>
      <Button
        {...handlers}
        round
        disabled={disabled}
        iconSource={uiIcon(icon, filled ? colors.onPrimary : colors.icon, Math.round(size * 0.42))}
        backgroundColor={filled ? colors.primary : variant === 'tonal' ? colors.surfaceHigh : 'transparent'}
        disabledBackgroundColor={colors.surfaceHigh}
        style={[{ width: size, height: size }, disabled && styles.disabled]}
        accessibilityLabel={accessibilityLabel}
        hitSlop={6}
      />
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    disabled: { opacity: 0.4 },
    label: { color: colors.textMuted, fontSize: 12 },
  });
