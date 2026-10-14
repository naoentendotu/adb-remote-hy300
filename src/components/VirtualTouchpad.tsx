import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { colors, radius } from '@/theme';

const TAP_SLOP_PX = 12;
const TAP_MAX_MS = 350;

/**
 * Absolute touchpad: the surface is the projector screen. A tap is sent as `input tap`; a drag is
 * replayed as one `input swipe` after the finger lifts (each `input` call costs ~1 s on the HY300,
 * so live dragging is not possible over this channel).
 */
export function VirtualTouchpad({ enabled }: { enabled: boolean }) {
  const { client, state, tick } = useAdbConnection();
  const screen = state.info?.screen;
  const aspect = screen ? screen.width / screen.height : 16 / 9;
  const layout = useRef<LayoutRectangle | null>(null);
  const [trail, setTrail] = useState<{ x: number; y: number }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const start = useRef({ x: 0, y: 0, t: 0 });
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // PanResponder handlers run on touch events, never during render; the compiler can't tell, so this component opts out.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => {
    const norm = (x: number, y: number) => {
      const l = layout.current!;
      return { x: Math.min(Math.max(x / l.width, 0), 1), y: Math.min(Math.max(y / l.height, 0), 1) };
    };
    const report = (p: Promise<void>, ok: string) => {
      setMessage('Enviando…');
      p.then(() => setMessage(ok)).catch((e) => setMessage(describeError(toAdbError(e))));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabledRef.current && !!layout.current,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        start.current = { x, y, t: e.nativeEvent.timestamp };
        setTrail([{ x, y }]);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        setTrail((t) => (t.length > 40 ? [...t.slice(-39), { x, y }] : [...t, { x, y }]));
      },
      onPanResponderRelease: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        const s = start.current;
        const dt = e.nativeEvent.timestamp - s.t;
        const a = norm(s.x, s.y);
        tick();
        if (Math.hypot(x - s.x, y - s.y) < TAP_SLOP_PX && dt < TAP_MAX_MS) {
          report(client.tap(a.x, a.y), 'Toque enviado.');
        } else {
          const b = norm(x, y);
          report(client.swipe(a.x, a.y, b.x, b.y, dt), 'Deslize enviado.');
        }
        setTimeout(() => setTrail([]), 500);
      },
    });
  }, [client, tick]);

  return (
    <View style={styles.wrap}>
      <View
        {...responder.panHandlers}
        onLayout={(e) => (layout.current = e.nativeEvent.layout)}
        style={[styles.pad, { aspectRatio: aspect }, !enabled && styles.disabled]}
        accessibilityLabel="Touchpad: toque para selecionar, arraste para deslizar"
        accessibilityHint="A área representa a tela do projetor">
        {trail.map((p, i) => (
          <View key={i} style={[styles.dot, { left: p.x - 6, top: p.y - 6, opacity: (i + 1) / trail.length }]} />
        ))}
        {trail.length === 0 && <Text style={styles.placeholder}>Tela do projetor{screen ? ` · ${screen.width}×${screen.height}` : ''}</Text>}
      </View>
      <Text style={styles.message}>
        {message ?? 'Toque = selecionar. Arraste = deslizar (enviado ao soltar; ~1 s de atraso no HY300).'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%' },
  pad: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outline,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  dot: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  placeholder: { color: colors.textMuted, fontSize: 13 },
  message: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
