import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Button } from 'react-native-ui-lib';
import Gamepad2 from 'lucide-react-native/icons/gamepad-2';
import Keyboard from 'lucide-react-native/icons/keyboard';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import Touchpad from 'lucide-react-native/icons/touchpad';

import type { IconName } from '@/components/RemoteButton';
import { uiIcon } from '@/components/uiIcon';
import { radius, useThemed, type Colors } from '@/theme';

export type Tab = 'pad' | 'text' | 'touch' | 'apps';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'pad', label: 'Controle', icon: Gamepad2 },
  { id: 'text', label: 'Teclado', icon: Keyboard },
  { id: 'touch', label: 'Touchpad', icon: Touchpad },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
];

const SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };
/** The tabs themselves slide to their new places with the same timing as the pill, instead of jumping. */
const ITEM_SLIDE = LinearTransition.duration(SLIDE.duration).easing(SLIDE.easing);

/**
 * Rounded pill bar: unselected tabs show only their icon; the selected one widens to icon + name.
 * The dark highlight is one shared pill that slides to the selected tab's measured box.
 */
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { colors, styles } = useThemed(makeStyles);
  // Only the selected tab's box, measured *after* it was selected: selecting widens it (label appears) and shifts
  // its neighbours, so an earlier measurement points at a stale spot and the pill would retarget mid-slide.
  const [selected, setSelected] = useState<{ tab: Tab; x: number; width: number } | null>(null);
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const box = selected?.tab === tab ? selected : null;

  useEffect(() => {
    if (!box) return;
    // First measurement places the pill without sliding in from the left edge.
    const first = width.get() === 0;
    x.set(first ? box.x : withTiming(box.x, SLIDE));
    width.set(first ? box.width : withTiming(box.width, SLIDE));
  }, [box, x, width]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }], width: width.get() }));

  return (
    <Animated.View style={styles.bar} accessibilityRole="tablist" layout={ITEM_SLIDE}>
      <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <Animated.View
            key={t.id}
            layout={ITEM_SLIDE}
            onLayout={(e) => {
              if (!on) return;
              const { x: bx, width: bw } = e.nativeEvent.layout;
              setSelected((b) => (b?.tab === t.id && b.x === bx && b.width === bw ? b : { tab: t.id, x: bx, width: bw }));
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
          </Animated.View>
        );
      })}
    </Animated.View>
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
