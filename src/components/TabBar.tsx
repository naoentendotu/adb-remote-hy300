import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Button } from 'react-native-ui-lib';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Keyboard from 'lucide-react-native/icons/keyboard';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';

import type { IconName } from '@/components/RemoteButton';
import { uiIcon } from '@/components/uiIcon';
import { radius, useThemed, type Colors } from '@/theme';

export type Tab = 'pad' | 'text' | 'apps';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'pad', label: 'Controle', icon: Gamepad2 },
  { id: 'text', label: 'Teclado', icon: Keyboard },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
];

const SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };

/**
 * Rounded pill bar: unselected tabs show only their icon; the selected one widens to icon + name.
 * The dark highlight is one shared pill that slides to the selected tab's measured box.
 */
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { colors, styles } = useThemed(makeStyles);
  const [boxes, setBoxes] = useState<Partial<Record<Tab, { x: number; width: number }>>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const box = boxes[tab];

  useEffect(() => {
    if (!box) return;
    // First measurement places the pill without sliding in from the left edge.
    const first = width.get() === 0;
    x.set(first ? box.x : withTiming(box.x, SLIDE));
    width.set(first ? box.width : withTiming(box.width, SLIDE));
  }, [box, x, width]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], width: width.get() }));

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <View
            key={t.id}
            onLayout={(e) => {
              const { x: bx, width: bw } = e.nativeEvent.layout;
              setBoxes((b) => (b[t.id]?.x === bx && b[t.id]?.width === bw ? b : { ...b, [t.id]: { x: bx, width: bw } }));
            }}>
            <Button
              label={on ? t.label : undefined}
              iconSource={uiIcon(t.icon, on ? colors.onInk : colors.textMuted, 22, on ? 8 : 0)}
              backgroundColor="transparent"
              color={colors.onInk}
              labelStyle={styles.label}
              borderRadius={radius.full}
              style={styles.item}
              avoidMinWidth
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(t.id)}
            />
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignSelf: 'center',
      gap: 6,
      padding: 6,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.outline,
    },
    pill: { position: 'absolute', left: 0, top: 6, height: 46, borderRadius: radius.full, backgroundColor: colors.ink },
    item: { height: 46, minWidth: 46, paddingHorizontal: 12 },
    label: { fontSize: 15, fontWeight: '700' },
  });
