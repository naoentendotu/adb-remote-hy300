import { useEffect, useRef, useState } from 'react';
import { StyleSheet, type GestureResponderEvent } from 'react-native';
import { Button, Text, View } from 'react-native-ui-lib';
import Info from 'lucide-react-native/icons/info';

import { TouchpadTutorial } from '@/components/TouchpadTutorial';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { MOUSE_LEFT, MOUSE_RIGHT, mouseReports } from '@/services/adb/AdbCommands';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { radius, useThemed, type Colors } from '@/theme';

const TAP_MS = 220; // shorter than this, and barely moved, is a click
const TAP_SLOP = 10; // px of finger travel still counted as a tap
const SCROLL_STEP = 22; // px of two-finger travel per wheel notch
const BASE_GAIN = 1.4; // cursor px per finger px when moving slowly
const ACCEL = 1.1; // extra gain per px/ms of finger speed, like a laptop's pointer acceleration
const MAX_GAIN = 4;

const centroid = (e: GestureResponderEvent) => {
  const t = e.nativeEvent.touches;
  const n = t.length || 1;
  return { x: t.reduce((s, p) => s + p.pageX, 0) / n, y: t.reduce((s, p) => s + p.pageY, 0) / n, n: t.length };
};

/**
 * Laptop-style touchpad for the projector's mouse: one finger moves the cursor, a tap clicks, two fingers scroll,
 * a two-finger tap is a right click (Back on Android). Moves are accumulated and sent in batches, one exec at a
 * time, so a fast swipe never builds an ADB backlog.
 */
export function TouchpadPanel({ enabled }: { enabled: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const { client, tick, settings, updateSettings } = useAdbConnection();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const pending = useRef({ dx: 0, dy: 0, wheel: 0 });
  const sending = useRef(false);
  const touch = useRef({ start: 0, moved: 0, fingers: 0, x: 0, y: 0, n: 0, t: 0 });
  // Opens by itself until seen once (saved), and again from the (i) button.
  const [tutorial, setTutorial] = useState(false);
  const firstTime = !settings.touchpadTutorialSeen;
  const closeTutorial = () => {
    setTutorial(false);
    if (firstTime) updateSettings({ touchpadTutorialSeen: true });
  };

  const fail = (e: unknown) => setError(describeError(toAdbError(e)));

  // The virtual mouse (and its cursor) exists only while this tab is open.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    client
      .startMouse()
      .then(() => alive && setReady(true))
      .catch(fail);
    return () => {
      alive = false;
      setReady(false);
      void client.stopMouse().catch(() => {});
    };
  }, [client, enabled]);

  const flush = async () => {
    if (sending.current || !ready) return;
    sending.current = true;
    try {
      for (;;) {
        const p = pending.current;
        const dx = Math.trunc(p.dx), dy = Math.trunc(p.dy), wheel = Math.trunc(p.wheel);
        if (!dx && !dy && !wheel) break;
        p.dx -= dx;
        p.dy -= dy;
        p.wheel -= wheel;
        await client.mouse(mouseReports(dx, dy, wheel));
      }
      setError(null);
    } catch (e) {
      // `hid` can die (projector slept, process killed): drop the backlog and bring the mouse back.
      pending.current = { dx: 0, dy: 0, wheel: 0 };
      fail(e);
      client.startMouse().catch(() => {});
    } finally {
      sending.current = false;
    }
  };

  const click = (buttons: number) => {
    tick();
    client.mouse([...mouseReports(0, 0, 0, buttons), [0, 0, 0, 0]]).catch(fail);
  };

  const onGrant = (e: GestureResponderEvent) => {
    const c = centroid(e);
    touch.current = { start: Date.now(), moved: 0, fingers: c.n, x: c.x, y: c.y, n: c.n, t: e.nativeEvent.timestamp };
  };

  const onMove = (e: GestureResponderEvent) => {
    const g = touch.current;
    const c = centroid(e);
    g.fingers = Math.max(g.fingers, c.n);
    // Lifting or adding a finger jumps the centroid: restart from the new point instead of sending that jump.
    if (c.n !== g.n) {
      Object.assign(g, { x: c.x, y: c.y, n: c.n, t: e.nativeEvent.timestamp });
      return;
    }
    const dx = c.x - g.x, dy = c.y - g.y;
    const dt = Math.max(1, e.nativeEvent.timestamp - g.t);
    Object.assign(g, { x: c.x, y: c.y, t: e.nativeEvent.timestamp, moved: g.moved + Math.abs(dx) + Math.abs(dy) });
    if (c.n >= 2) {
      // Natural scrolling, as on a laptop: fingers up moves the content up.
      pending.current.wheel += dy / SCROLL_STEP;
    } else {
      const gain = Math.min(MAX_GAIN, BASE_GAIN + (ACCEL * Math.hypot(dx, dy)) / dt);
      pending.current.dx += dx * gain;
      pending.current.dy += dy * gain;
    }
    void flush();
  };

  const onRelease = () => {
    const g = touch.current;
    if (Date.now() - g.start < TAP_MS && g.moved < TAP_SLOP) click(g.fingers >= 2 ? MOUSE_RIGHT : MOUSE_LEFT);
  };

  const active = enabled && ready;
  return (
    <View flex gap-s3>
      <View
        style={[styles.pad, !active && styles.disabled]}
        accessibilityLabel="Touchpad: deslize para mover o cursor do projetor, toque para clicar"
        onStartShouldSetResponder={() => active}
        onMoveShouldSetResponder={() => active}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}>
        <Text style={styles.hint}>
          {!enabled ? 'Conecte ao projetor para usar o touchpad.' : ready ? 'Um dedo move · toque clica\nDois dedos rolam · toque com dois dedos volta' : 'Ligando o mouse do projetor…'}
        </Text>
      </View>
      <View row centerV gap-s2>
        <Button
          round
          style={styles.info}
          backgroundColor={colors.surfaceHigh}
          iconSource={uiIcon(Info, colors.icon, 22)}
          accessibilityLabel="Como usar o touchpad"
          onPress={() => setTutorial(true)}
        />
        <View flex>
          <Button label="Clique" size={Button.sizes.large} borderRadius={radius.full} backgroundColor={colors.surfaceHigh} color={colors.icon} disabled={!active} onPress={() => click(MOUSE_LEFT)} />
        </View>
        <View flex>
          <Button label="Direito" size={Button.sizes.large} borderRadius={radius.full} backgroundColor={colors.surfaceHigh} color={colors.icon} disabled={!active} onPress={() => click(MOUSE_RIGHT)} />
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchpadTutorial visible={tutorial || firstTime} onClose={closeTutorial} />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    pad: {
      flex: 1,
      minHeight: 260,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    hint: { color: colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
    error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
    info: { width: 52, height: 52 },
    disabled: { opacity: 0.5 },
  });
