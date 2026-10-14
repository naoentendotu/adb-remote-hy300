import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

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
  const filled = variant === 'filled';
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        {...handlers}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        hitSlop={6}
        style={({ pressed }) => [
          styles.button,
          { width: size, height: size },
          variant === 'tonal' && styles.tonal,
          filled && styles.filled,
          pressed && (filled ? styles.filledPressed : styles.pressed),
          pressed && styles.shrink,
          disabled && styles.disabled,
        ]}>
        <MaterialCommunityIcons name={icon} size={Math.round(size * 0.42)} color={filled ? colors.onPrimary : colors.text} />
      </Pressable>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6 },
  button: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  tonal: { backgroundColor: colors.surfaceHigh },
  filled: { backgroundColor: colors.primary },
  pressed: { backgroundColor: colors.surfacePressed },
  filledPressed: { opacity: 0.85 },
  shrink: { transform: [{ scale: 0.94 }] },
  disabled: { opacity: 0.35 },
  label: { color: colors.textMuted, fontSize: 12 },
});
