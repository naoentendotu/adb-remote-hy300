import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, SegmentedControl, Switch, Text, View } from 'react-native-ui-lib';

import { SavedProjector } from '@/components/SavedProjector';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { CARD_GAP, MONO, SCREEN_PAD, STATUS_LABEL, radius, useScheme, useThemed, type Colors } from '@/theme';

const THEMES = ['dark', 'light'] as const;

export default function DiagnosticsScreen() {
  const { colors, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const scheme = useScheme();
  const { client, state, demo, settings, updateSettings } = useAdbConnection();
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const info = state.info;
  const connected = state.status === 'connected';

  const ping = async () => {
    setPinging(true);
    setPingError(null);
    await client.ping().catch((e) => setPingError(describeError(toAdbError(e))));
    setPinging(false);
  };

  const resetKey = () =>
    Alert.alert(
      'Gerar nova chave ADB',
      'Desconecta e descarta a identidade ADB deste celular. Na próxima conexão o projetor tratará o celular como um dispositivo novo (se ele exigir autorização).',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Gerar nova chave', style: 'destructive', onPress: () => client.resetKey().catch(() => {}) }],
    );

  const metric = (label: string, value: string, mono = false) => (
    <View flex gap-s1 style={styles.metric}>
      <Text style={styles.key}>{label}</Text>
      <Text style={[styles.value, mono && styles.mono]}>{value}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + 32 }]}>
      <Text style={styles.section}>Preferências</Text>
      <Card padding-s4 gap-s4 enableShadow={false} borderRadius={radius.md} style={styles.card}>
        <View gap-s2>
          <Text style={styles.rowLabel}>Tema</Text>
          {/* Same control and colors as the HY300/HY320 picker on the home screen. */}
          <SegmentedControl
            segments={[{ label: 'Escuro' }, { label: 'Claro' }]}
            initialIndex={THEMES.indexOf(scheme)}
            onChangeIndex={(i: number) => updateSettings({ theme: THEMES[i] })}
            backgroundColor={colors.surface}
            activeBackgroundColor={colors.primaryContainer}
            activeColor={colors.onPrimaryContainer}
            inactiveColor={colors.textMuted}
            outlineColor={colors.primary}
          />
        </View>
        <View row centerV gap-s3>
          <View flex>
            <Text style={styles.rowLabel}>Vibração ao tocar</Text>
            <Text style={styles.key}>Resposta tátil nos botões do controle.</Text>
          </View>
          <Switch
            value={settings.haptics}
            onValueChange={(v: boolean) => updateSettings({ haptics: v })}
            onColor={colors.primary}
            offColor={colors.outline}
            accessibilityLabel="Vibração ao tocar"
          />
        </View>
      </Card>

      <Text style={styles.section}>Dispositivo</Text>
      <SavedProjector />

      <Card padding-s4 gap-s3 enableShadow={false} borderRadius={radius.md} style={styles.card}>
        <View row gap-s3>
          {metric('Modo', demo ? 'Demonstração' : 'ADB real')}
          {metric('Estado', STATUS_LABEL[state.status])}
        </View>
        <View row gap-s3>
          <View flex gap-s1 style={styles.metric}>
            <Text style={styles.key}>Latência</Text>
            <View row centerV spread>
              <Text style={[styles.value, styles.mono]}>{state.latencyMs !== undefined ? `${state.latencyMs} ms` : '—'}</Text>
              <Button link label={pinging ? 'Medindo…' : 'Medir'} linkColor={colors.primary} labelStyle={styles.link} disabled={!connected || pinging} onPress={ping} />
            </View>
          </View>
          {metric('Modelo / API', info ? `${info.model} / ${info.sdk}` : '—', true)}
        </View>
        <View row gap-s3>
          {metric('Endereço', state.host ? `${state.host}:${state.port}` : '—', true)}
          {metric('Shell ADB', info ? `${info.isRoot ? 'root' : 'sem root'} (uid ${info.uid})` : '—', true)}
        </View>
        {metric('Envio de teclas', info ? (info.irDevice ? `rápido via ${info.irDevice}` : 'input keyevent (~1 s por tecla)') : '—', true)}
        {state.error && metric('Último erro', describeError(state.error))}
        {pingError && <Text style={styles.error}>{pingError}</Text>}
      </Card>

      <Text style={styles.section}>Segurança</Text>
      <Text style={styles.body}>
        O app só conecta ao endereço da rede local que você informar e não envia nada para servidores externos. A chave ADB deste
        celular fica cifrada pelo Android Keystore e nunca aparece em logs.{'\n\n'}
        HY300: na investigação, o projetor estava com ro.adb.secure=0 — o ADB não pede autorização e entrega shell root a qualquer
        aparelho da mesma rede Wi-Fi. Mantenha o ADB por rede desligado quando não estiver usando, e nunca encaminhe a porta 5555 no
        roteador.{'\n\n'}
        Revogar este celular (em aparelhos que exigem autorização): no projetor, Configurações → Opções do desenvolvedor → Revogar
        autorizações de depuração USB. Por ADB, apague /data/misc/adb/adb_keys. Use também “Gerar nova chave” abaixo.
      </Text>
      <Button
        label="Gerar nova chave ADB"
        size={Button.sizes.large}
        borderRadius={radius.full}
        backgroundColor={colors.dangerContainer}
        color={colors.danger}
        style={styles.danger}
        onPress={resetKey}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    page: { paddingHorizontal: SCREEN_PAD, paddingTop: 12, gap: CARD_GAP },
    section: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 8 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
    metric: { backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: 12 },
    key: { color: colors.textMuted, fontSize: 12 },
    value: { color: colors.text, fontSize: 15 },
    mono: { fontFamily: MONO, fontSize: 14 },
    link: { fontSize: 13, fontWeight: '600' },
    body: { color: colors.text, fontSize: 14, lineHeight: 21 },
    error: { color: colors.danger, fontSize: 14 },
    danger: { borderWidth: 1, borderColor: colors.dangerOutline },
  });
