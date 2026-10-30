import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Button, Card, Text, View } from 'react-native-ui-lib';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import OctagonX from 'lucide-react-native/icons/octagon-x';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import Search from 'lucide-react-native/icons/search';

import { Field } from '@/components/Field';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { radius, useThemed, type Colors } from '@/theme';

/** Never force-stopped: the launcher and the system UI. */
const PROTECTED = ['com.spocky.projengmenu', 'android', 'com.android.systemui'];

export function AppsPanel({ enabled }: { enabled: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const { client, tick, apps, appsLoading, reloadApps } = useAdbConnection();
  const [msg, setMsg] = useState<{ error: boolean; text: string } | null>(null);
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

  const loadApps = () => reloadApps().catch((e) => setMsg({ error: true, text: describeError(toAdbError(e)) }));
  const search = () => query.trim() && act('Abrindo a Play Store', () => client.openStoreSearch(query), () => 'Busca aberta na Play Store do projetor.');

  // Opening the tab with nothing loaded fetches straight away instead of asking the user to.
  useEffect(() => {
    if (enabled && !apps?.length && !appsLoading) void loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return (
    <View gap-s3>
      <View row spread centerV>
        <Text style={styles.section}>Apps do projetor</Text>
        <Button
          label="Fechar app travado"
          size={Button.sizes.small}
          borderRadius={radius.full}
          backgroundColor={colors.dangerContainer}
          color={colors.danger}
          style={styles.danger}
          iconSource={uiIcon(OctagonX, colors.danger, 16, 6)}
          disabled={!enabled}
          onPress={() => act('Fechando o app da tela', () => client.closeForegroundApp(PROTECTED), (pkg) => (pkg ? `Fechado: ${pkg}` : 'Nenhum app aberto para fechar.'))}
        />
      </View>

      {appsLoading ? (
        <View center paddingV-s10 gap-s3>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Buscando os apps do projetor…</Text>
        </View>
      ) : !apps?.length ? (
        <View center paddingV-s8 gap-s3>
          <LayoutGrid size={32} color={colors.textMuted} strokeWidth={1.75} />
          <Text style={styles.hint}>{enabled ? 'Nenhum app encontrado.' : 'Conecte ao projetor para ver os apps.'}</Text>
          {enabled && (
            <Button label="Tentar novamente" size={Button.sizes.medium} borderRadius={radius.full} outline outlineColor={colors.outline} color={colors.primary} onPress={() => void loadApps()} />
          )}
        </View>
      ) : (
        <>
          <View row style={styles.grid}>
            {apps.map((s) => (
              <Card
                key={s.pkg}
                center
                paddingV-s4
                gap-s2
                enableShadow={false}
                borderRadius={radius.sm}
                style={[styles.tile, !enabled && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${s.label}`}
                onPress={enabled ? () => act(`Abrindo ${s.label}`, () => client.launchApp(s.pkg), () => `${s.label} aberto.`) : undefined}>
                <Image source={{ uri: s.icon }} style={styles.icon} accessibilityIgnoresInvertColors />
                <Text style={styles.tileText} numberOfLines={1}>
                  {s.label}
                </Text>
              </Card>
            ))}
          </View>
          <Button
            link
            label="Atualizar lista"
            linkColor={colors.primary}
            labelStyle={styles.link}
            iconSource={uiIcon(RefreshCw, colors.primary, 18, 6)}
            disabled={!enabled}
            onPress={() => void loadApps()}
          />
        </>
      )}

      {msg && <Text style={[styles.msg, msg.error && { color: colors.danger }]}>{msg.text}</Text>}

      <Text style={[styles.section, styles.spaced]}>Instalar app</Text>
      <View row gap-s2>
        <View flex>
          <Field value={query} onChangeText={setQuery} placeholder="Nome do app (ex.: VLC)" returnKeyType="search" onSubmitEditing={search} accessibilityLabel="Nome do app para buscar na Play Store do projetor" />
        </View>
        <Button
          round
          backgroundColor={colors.primary}
          disabledBackgroundColor={colors.primary}
          iconSource={uiIcon(Search, colors.onPrimary, 22)}
          accessibilityLabel="Buscar na Play Store"
          disabled={!enabled || !query.trim()}
          onPress={search}
          style={[styles.searchButton, (!enabled || !query.trim()) && styles.disabled]}
        />
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    section: { color: colors.text, fontSize: 16, fontWeight: '600' },
    spaced: { marginTop: 8 },
    hint: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
    danger: { borderWidth: 1, borderColor: colors.dangerOutline },
    grid: { flexWrap: 'wrap', gap: 10 },
    tile: { width: '31%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
    icon: { width: 40, height: 40 },
    tileText: { color: colors.text, fontSize: 13 },
    link: { fontSize: 14, fontWeight: '600' },
    searchButton: { width: 52, height: 52 },
    msg: { color: colors.textMuted, fontSize: 13 },
    disabled: { opacity: 0.45 },
  });
