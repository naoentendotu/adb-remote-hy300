import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import type { RemoteKey } from '@/types/adb';

const REPEAT_DELAY_MS = 450;
const REPEAT_GAP_MS = 110;

interface Props {
  /** Resolves when the projector acknowledged the key; a rejection stops any repeat. */
  onKey: (key: RemoteKey) => Promise<void>;
  /** Holding OK sends a real long press (context menus), like the physical remote. */
  onLongKey: (key: RemoteKey) => Promise<void>;
  enabled: boolean;
  size?: number;
}

/**
 * Hold-to-repeat sends a complete press each time and waits for the previous one to finish, so a
 * held button can never queue a backlog, and it stops on release, on error, or when the link drops
 * (the projector never sees a key left "down").
 */
export function DirectionalPad({ onKey, onLongKey, enabled, size = 280 }: Props) {
  const held = useRef<RemoteKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabledRef = useRef(enabled);

  const stop = () => {
    held.current = null;
    clearTimeout(timer.current);
  };
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) stop();
  }, [enabled]);
  useEffect(() => stop, []);

  const start = (key: RemoteKey) => {
    stop();
    held.current = key;
    onKey(key).catch(stop);
    const loop = async () => {
      while (held.current === key && enabledRef.current) {
        try {
          await onKey(key);
        } catch {
          stop();
          return;
        }
        await new Promise((r) => setTimeout(r, REPEAT_GAP_MS));
      }
    };
    timer.current = setTimeout(loop, REPEAT_DELAY_MS);
  };

  const arrow = (key: RemoteKey, icon: 'chevron-up' | 'chevron-down' | 'chevron-left' | 'chevron-right', label: string, pos: object) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPressIn={() => start(key)}
      onPressOut={stop}
      style={({ pressed }) => [styles.arrow, { width: size * 0.34, height: size * 0.34 }, pos, pressed && styles.arrowPressed]}>
      <MaterialCommunityIcons name={icon} size={size * 0.15} color={enabled ? colors.text : colors.textMuted} />
    </Pressable>
  );

  const c = size * 0.33;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, !enabled && styles.disabled]}>
      {arrow('up', 'chevron-up', 'Cima', { top: 0, alignSelf: 'center' })}
      {arrow('down', 'chevron-down', 'Baixo', { bottom: 0, alignSelf: 'center' })}
      {arrow('left', 'chevron-left', 'Esquerda', { left: 0, top: size * 0.33 })}
      {arrow('right', 'chevron-right', 'Direita', { right: 0, top: size * 0.33 })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="OK"
        disabled={!enabled}
        onPress={() => void onKey('center').catch(() => {})}
        onLongPress={() => void onLongKey('center').catch(() => {})}
        delayLongPress={450}
        style={({ pressed }) => [
          styles.center,
          { width: c * 1.15, height: c * 1.15, borderRadius: c },
          pressed && styles.centerPressed,
        ]}>
        <MaterialCommunityIcons name="check" size={size * 0.12} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  arrow: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  arrowPressed: { backgroundColor: colors.surfacePressed },
  center: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  centerPressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});
