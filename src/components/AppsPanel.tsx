import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { IconName } from '@/components/RemoteButton';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { colors, radius } from '@/theme';

/** Apps found installed on the HY300 (pm list packages). */
const SHORTCUTS: { pkg: string; label: string; icon: IconName }[] = [
  { pkg: 'org.smarttube.stable', label: 'SmartTube', icon: 'play-box-outline' },
  { pkg: 'com.google.android.youtube.tv', label: 'YouTube', icon: 'youtube' },
  { pkg: 'com.amazon.avod.thirdpartyclient', label: 'Prime Video', icon: 'filmstrip' },
  { pkg: 'com.disney.disneyplus', label: 'Disney+', icon: 'movie-open-outline' },
  { pkg: 'com.android.vending', label: 'Play Store', icon: 'shopping-outline' },
  { pkg: 'com.android.tv.settings', label: 'Ajustes', icon: 'cog-outline' },
];

/** Never force-stopped: the launcher and the system UI. */
const PROTECTED = ['com.spocky.projengmenu', 'android', 'com.android.systemui'];
const TIMERS = [15, 30, 60, 90, 120];

const fmt = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.ceil(s / 60)} min`);

export function AppsPanel({ enabled }: { enabled: boolean }) {
  const { client, tick } = useAdbConnection();
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const act = async <T,>(label: string, fn: () => Promise<T>, ok: (r: T) => string) => {
    tick();
    setMsg({ error: false, text: `${label}…` });
    try {
      setMsg({ error: false, text: ok(await fn()) });
    } catch (e) {
      setMsg({ error: true, text: describeError(toAdbError(e)) });
    }
  };

  const refreshTimer = () => client.sleepRemaining().then(setRemaining).catch(() => {});
  useEffect(() => {
    if (enabled) void refreshTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, client]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Abrir app</Text>
      <View style={styles.grid}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.pkg}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${s.label}`}
            disabled={!enabled}
            onPress={() => act(`Abrindo ${s.label}`, () => client.launchApp(s.pkg), () => `${s.label} aberto.`)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed, !enabled && styles.disabled]}>
            <MaterialCommunityIcons name={s.icon} size={26} color={colors.text} />
            <Text style={styles.tileText} numberOfLines={1}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!enabled}
        onPress={() =>
          act('Fechando o app da tela', () => client.closeForegroundApp(PROTECTED), (pkg) => (pkg ? `Fechado: ${pkg}` : 'Nenhum app aberto para fechar.'))
        }
        style={({ pressed }) => [styles.outline, pressed && styles.pressed, !enabled && styles.disabled]}>
        <MaterialCommunityIcons name="close-octagon-outline" size={20} color={colors.danger} />
        <Text style={[styles.outlineText, { color: colors.danger }]}>Fechar app travado</Text>
      </Pressable>

      <Text style={styles.section}>Temporizador de desligamento</Text>
      <Text style={styles.hint}>
        {remaining ? `Entra em espera em ${fmt(remaining)}.` : 'Nenhum temporizador ativo.'} Roda no projetor; funciona com o celular desligado.
      </Text>
      <View style={styles.chips}>
        {TIMERS.map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            disabled={!enabled}
            onPress={() => act('Programando', () => client.scheduleSleep(m).then(refreshTimer), () => `Espera programada para daqui a ${fmt(m * 60)}.`)}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed, !enabled && styles.disabled]}>
            <Text style={styles.chipText}>{fmt(m * 60)}</Text>
          </Pressable>
        ))}
        {remaining ? (
          <Pressable
            accessibilityRole="button"
            disabled={!enabled}
            onPress={() => act('Cancelando', () => client.cancelSleep().then(refreshTimer), () => 'Temporizador cancelado.')}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
            <Text style={[styles.chipText, { color: colors.danger }]}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.section}>Instalar app</Text>
      <View style={styles.row}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Nome do app (ex.: VLC)"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => query.trim() && act('Abrindo a Play Store', () => client.openStoreSearch(query), () => 'Busca aberta na Play Store do projetor.')}
          accessibilityLabel="Nome do app para buscar na Play Store do projetor"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar na Play Store"
          disabled={!enabled || !query.trim()}
          onPress={() => act('Abrindo a Play Store', () => client.openStoreSearch(query), () => 'Busca aberta na Play Store do projetor.')}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed, (!enabled || !query.trim()) && styles.disabled]}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>

      {msg && <Text style={[styles.msg, msg.error && { color: colors.danger }]}>{msg.text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', gap: 6 },
  tileText: { color: colors.text, fontSize: 13 },
  outline: { flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.outline, paddingVertical: 13 },
  outlineText: { fontWeight: '600', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outline },
  chipText: { color: colors.text, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  searchButton: { width: 48, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  msg: { color: colors.textMuted, fontSize: 13 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
});
