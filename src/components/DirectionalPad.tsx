import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronUp from 'lucide-react-native/icons/chevron-up';

import { useThemed, type Colors } from '@/theme';
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
  const { colors, styles } = useThemed(makeStyles);
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

  const arrow = (key: RemoteKey, Icon: LucideIcon, label: string, pos: object) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPressIn={() => start(key)}
      onPressOut={stop}
      style={({ pressed }) => [styles.arrow, { width: size * 0.34, height: size * 0.34 }, pos, pressed && styles.arrowPressed]}>
      <Icon size={size * 0.14} color={enabled ? colors.icon : colors.textMuted} strokeWidth={2.25} />
    </Pressable>
  );

  const c = size * 0.33;
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, !enabled && styles.disabled]}>
      {/* Two diagonals = four dividers marking the up/right/down/left zones of the ring. */}
      {[45, -45].map((deg) => (
        <View key={deg} pointerEvents="none" style={[styles.divider, { width: size, transform: [{ rotate: `${deg}deg` }] }]} />
      ))}
      {arrow('up', ChevronUp, 'Cima', { top: 0, alignSelf: 'center' })}
      {arrow('down', ChevronDown, 'Baixo', { bottom: 0, alignSelf: 'center' })}
      {arrow('left', ChevronLeft, 'Esquerda', { left: 0, top: size * 0.33 })}
      {arrow('right', ChevronRight, 'Direita', { right: 0, top: size * 0.33 })}
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
        <Text style={styles.ok}>OK</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    ring: { backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    divider: { position: 'absolute', height: 1, backgroundColor: colors.outline },
    ok: { color: colors.onPrimary, fontSize: 18, fontWeight: '700' },
    disabled: { opacity: 0.4 },
    arrow: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
    arrowPressed: { backgroundColor: colors.surfacePressed },
    center: { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    centerPressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
  });
