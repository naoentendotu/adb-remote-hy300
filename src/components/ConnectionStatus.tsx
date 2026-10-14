import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { STATUS_COLOR, STATUS_LABEL, colors, radius } from '@/theme';
import type { ConnectionStatus as Status } from '@/types/adb';

const BUSY: Status[] = ['checking-network', 'connecting', 'awaiting-auth', 'reconnecting'];

export function ConnectionStatus({ status, detail }: { status: Status; detail?: string }) {
  const color = STATUS_COLOR[status];
  return (
    <View style={styles.pill} accessibilityRole="text" accessibilityLiveRegion="polite">
      {BUSY.includes(status) ? <ActivityIndicator size="small" color={color} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={styles.label}>{STATUS_LABEL[status]}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 13 },
});
