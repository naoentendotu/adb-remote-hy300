import { StyleSheet, View } from 'react-native';
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

/** Rounded pill bar: unselected tabs show only their icon; the selected one widens to icon + name. */
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {TABS.map((t) => {
        const on = t.id === tab;
        return (
          <View key={t.id}>
            <Button
              label={on ? t.label : undefined}
              iconSource={uiIcon(t.icon, on ? colors.onInk : colors.textMuted, 22, on ? 8 : 0)}
              backgroundColor={on ? colors.ink : 'transparent'}
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
    item: { height: 46, minWidth: 46, paddingHorizontal: 12 },
    label: { fontSize: 15, fontWeight: '700' },
  });
