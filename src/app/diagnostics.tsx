import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { STATUS_LABEL, colors, radius } from '@/theme';

export default function DiagnosticsScreen() {
  const { client, state, demo } = useAdbConnection();
  const [pinging, setPinging] = useState(false);
  const [pingError, setPingError] = useState<string | null>(null);
  const info = state.info;

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

  const rows: [string, string][] = [
    ['Modo', demo ? 'Demonstração (ADB simulado)' : 'ADB real'],
    ['Estado', STATUS_LABEL[state.status]],
    ['Endereço', state.host ? `${state.host}:${state.port}` : '—'],
    ['Último erro', state.error ? describeError(state.error) : '—'],
    ['Latência (eco no shell)', state.latencyMs !== undefined ? `${state.latencyMs} ms` : '—'],
    ['Modelo / API', info ? `${info.model} / ${info.sdk}` : '—'],
    ['Privilégio do shell ADB', info ? (info.isRoot ? `root (uid ${info.uid})` : `sem root (uid ${info.uid})`) : '—'],
    ['Resolução usada pelo touchpad', info?.screen ? `${info.screen.width}×${info.screen.height}` : 'desconhecida'],
    ['Envio de teclas', info ? (info.irDevice ? `rápido via ${info.irDevice} (receptor IR)` : 'input keyevent (~1 s por tecla)') : '—'],
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{v}</Text>
          </View>
        ))}
      </View>
      <Pressable accessibilityRole="button" disabled={state.status !== 'connected' || pinging} onPress={ping} style={({ pressed }) => [styles.button, pressed && styles.pressed, (state.status !== 'connected' || pinging) && styles.disabled]}>
        <Text style={styles.buttonText}>{pinging ? 'Medindo…' : 'Medir latência'}</Text>
      </Pressable>
      {pingError && <Text style={styles.error}>{pingError}</Text>}

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
      <Pressable accessibilityRole="button" onPress={resetKey} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={[styles.buttonText, { color: colors.danger }]}>Gerar nova chave ADB</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 16 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline, gap: 2 },
  key: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.text, fontSize: 15 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12 },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  button: { borderRadius: radius.full, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.outline },
  buttonText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  error: { color: colors.danger, fontSize: 14 },
});
