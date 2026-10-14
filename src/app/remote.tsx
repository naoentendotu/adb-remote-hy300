import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppsPanel } from '@/components/AppsPanel';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { DirectionalPad } from '@/components/DirectionalPad';
import { RemoteButton, type IconName } from '@/components/RemoteButton';
import { TextInputPanel } from '@/components/TextInputPanel';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { colors, radius } from '@/theme';
import type { RemoteKey } from '@/types/adb';

type Tab = 'pad' | 'text' | 'apps';

export default function RemoteScreen() {
  const { client, state, tick } = useAdbConnection();
  const [tab, setTab] = useState<Tab>('pad');
  const [lastError, setLastError] = useState<string | null>(null);
  const connected = state.status === 'connected';

  const send = (key: RemoteKey, long = false) => {
    tick();
    setLastError(null);
    return (long ? client.longPressKey(key) : client.pressKey(key)).catch((e) => {
      const err = toAdbError(e);
      if (err.code !== 'CANCELLED') setLastError(describeError(err));
      throw err;
    });
  };
  const fire = (key: RemoteKey) => () => void send(key).catch(() => {});

  const small = (key: RemoteKey, icon: IconName, label: string, onPress: () => void = fire(key)) => (
    <RemoteButton icon={icon} label={label} accessibilityLabel={label} onPress={onPress} disabled={!connected} size={56} />
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Diagnóstico" onPress={() => router.push('/diagnostics')} hitSlop={10}>
              <Text style={styles.headerLink}>Diagnóstico</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.statusRow}>
          <ConnectionStatus status={state.status} detail={state.host} />
          {!connected && state.status !== 'reconnecting' && (
            <Pressable accessibilityRole="button" onPress={() => (state.host ? client.connect(state.host, state.port ?? 5555).catch(() => {}) : router.back())}>
              <Text style={styles.link}>Reconectar</Text>
            </Pressable>
          )}
        </View>
        {lastError && <Text style={styles.error}>{lastError}</Text>}

        <View style={styles.tabs} accessibilityRole="tablist">
          {(
            [
              ['pad', 'Direcional'],
              ['text', 'Teclado'],
              ['apps', 'Apps'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              onPress={() => setTab(id)}
              style={[styles.tab, tab === id && styles.tabOn]}>
              <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'pad' && (
          <View style={styles.center}>
            <DirectionalPad onKey={send} onLongKey={(k) => send(k, true)} enabled={connected} />
          </View>
        )}
        {tab === 'text' && <TextInputPanel enabled={connected} />}
        {tab === 'apps' && <AppsPanel enabled={connected} />}

        {tab === 'pad' && (
          <>
            <View style={styles.row}>
              {small('back', 'arrow-left', 'Voltar')}
              {small('home', 'home-outline', 'Home')}
            </View>
            <View style={styles.volume}>
              {small('volumeDown', 'volume-minus', 'Volume −')}
              {small('volumeUp', 'volume-plus', 'Volume +')}
            </View>
            <Text style={styles.hint}>
              Volume: com o painel de volume oculto, o primeiro toque apenas o exibe (comportamento do Android 9).
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 20, paddingBottom: 48 },
  headerLink: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 14 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.full, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.full, alignItems: 'center' },
  tabOn: { backgroundColor: colors.surfaceHigh },
  tabText: { color: colors.textMuted, fontWeight: '600' },
  tabTextOn: { color: colors.text },
  center: { alignItems: 'center', paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-evenly' },
  volume: { flexDirection: 'row', justifyContent: 'space-evenly', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: 12 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
