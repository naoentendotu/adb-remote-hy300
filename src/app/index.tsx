import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { parsePort, validateHost } from '@/services/adb/validation';
import { colors, radius } from '@/theme';

const DEFAULT_HOST = '';
const BUSY = ['checking-network', 'connecting', 'awaiting-auth', 'reconnecting'];

export default function ConnectionScreen() {
  const { client, state, demo, setDemo, settings, updateSettings } = useAdbConnection();
  const saved = settings.savedDevice;
  // Draft = what the user is typing; null means "show the saved device" (settings load asynchronously).
  const [draft, setDraft] = useState<{ host: string; port: string } | null>(null);
  const editing = draft !== null || !saved;
  const host = draft?.host ?? saved?.host ?? DEFAULT_HOST;
  const port = draft?.port ?? saved?.port ?? '5555';
  const setHost = (h: string) => setDraft({ host: h, port });
  const setPort = (p: string) => setDraft({ host, port: p });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const wantsRemote = useRef(false);

  useEffect(() => {
    if (state.status === 'connected' && wantsRemote.current) {
      wantsRemote.current = false;
      router.push('/remote');
    }
  }, [state.status]);

  const busy = BUSY.includes(state.status);
  const connected = state.status === 'connected';
  const fieldError = validateHost(host) ?? (parsePort(port) === null ? 'Porta inválida (1–65535).' : null);
  const isSaved = saved?.host === host.trim() && saved?.port === port.trim();

  const connect = () => {
    setTestResult(null);
    wantsRemote.current = true;
    client.connect(host, port).catch(() => (wantsRemote.current = false));
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await client.test(host, port);
    setTesting(false);
    setTestResult(
      `Porta TCP: ${r.tcp ? 'acessível' : 'sem resposta'}\nSessão ADB: ${r.adb ? 'negociada e shell respondendo' : 'não estabelecida'}` +
        (r.error ? `\n${describeError(r.error)}` : ''),
    );
  };

  return (
    <KeyboardAvoidingView behavior="height" style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <ConnectionStatus status={state.status} detail={state.host && state.status !== 'disconnected' ? `${state.host}:${state.port}` : undefined} />
        {state.status === 'awaiting-auth' && (
          <Text style={styles.note}>Se o projetor mostrar “Permitir depuração USB?”, aceite usando o controle físico.</Text>
        )}
        {state.status === 'error' && state.error && <Text style={styles.error}>{describeError(toAdbError(state.error))}</Text>}

        <Text style={styles.section}>Projetor</Text>
        {editing ? (
          <View style={styles.fields}>
            <View style={styles.fieldHost}>
              <Text style={styles.label}>Endereço IP</Text>
              <TextInput
                value={host}
                placeholder="192.168.0.10"
                placeholderTextColor={colors.textMuted}
                onChangeText={setHost}
                keyboardType="decimal-pad"
                autoCorrect={false}
                style={styles.input}
                editable={!busy && !connected}
                accessibilityLabel="Endereço IP do projetor"
              />
            </View>
            <View style={styles.fieldPort}>
              <Text style={styles.label}>Porta</Text>
              <TextInput
                value={port}
                onChangeText={setPort}
                keyboardType="number-pad"
                style={styles.input}
                editable={!busy && !connected}
                accessibilityLabel="Porta TCP do ADB"
              />
            </View>
          </View>
        ) : (
          <View style={styles.savedRow}>
            <View>
              <Text style={styles.savedHost}>{host}:{port}</Text>
              <Text style={styles.label}>Dispositivo salvo</Text>
            </View>
            <Pressable accessibilityRole="button" disabled={busy || connected} onPress={() => setDraft({ host, port })}>
              <Text style={[styles.link, (busy || connected) && styles.disabled]}>Editar</Text>
            </Pressable>
          </View>
        )}
        {editing && fieldError && host.length > 0 && <Text style={styles.fieldError}>{fieldError}</Text>}

        <View style={styles.actions}>
          {connected ? (
            <>
              <Button label="Abrir controle" filled onPress={() => router.push('/remote')} />
              <Button label="Desconectar" onPress={() => client.disconnect()} />
            </>
          ) : busy ? (
            <Button label="Cancelar" onPress={() => client.disconnect()} />
          ) : (
            <Button label="Conectar" filled disabled={!!fieldError || testing} onPress={connect} />
          )}
          <Button label={testing ? 'Testando…' : 'Testar conexão'} disabled={!!fieldError || testing || busy} onPress={test} />
        </View>
        {editing && (
          <Pressable
            accessibilityRole="button"
            disabled={!!fieldError || isSaved}
            onPress={() => {
              updateSettings({ savedDevice: { host: host.trim(), port: port.trim() } });
              setDraft(null);
            }}>
            <Text style={[styles.link, (!!fieldError || isSaved) && styles.disabled]}>Salvar dispositivo</Text>
          </Pressable>
        )}
        {testResult && <Text style={styles.result}>{testResult}</Text>}

        <Text style={styles.section}>Opções</Text>
        <Row label="Modo demonstração" hint="ADB simulado, sem rede. Para testar a interface sem o projetor.">
          <Switch value={demo} onValueChange={setDemo} disabled={busy} />
        </Row>
        <Row label="Vibração ao tocar">
          <Switch value={settings.haptics} onValueChange={(v) => updateSettings({ haptics: v })} />
        </Row>
        <Pressable accessibilityRole="button" onPress={() => router.push('/diagnostics')}>
          <Text style={styles.link}>Diagnóstico e segurança</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Button({ label, onPress, filled, disabled }: { label: string; onPress: () => void; filled?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, filled && styles.buttonFilled, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, filled && styles.buttonTextFilled]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.label}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12 },
  note: { color: colors.warning, fontSize: 14, lineHeight: 20 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  fields: { flexDirection: 'row', gap: 12 },
  fieldHost: { flex: 3, gap: 6 },
  fieldPort: { flex: 1.3, gap: 6 },
  label: { color: colors.textMuted, fontSize: 13 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
  },
  fieldError: { color: colors.danger, fontSize: 13 },
  savedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: 16 },
  savedHost: { color: colors.text, fontSize: 18, fontWeight: '600' },
  actions: { gap: 10 },
  button: { borderRadius: radius.full, paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: colors.outline },
  buttonFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { color: colors.text, fontWeight: '600', fontSize: 16 },
  buttonTextFilled: { color: colors.onPrimary },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  link: { color: colors.primary, fontSize: 15, fontWeight: '600', paddingVertical: 6 },
  result: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, padding: 14, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowLabel: { color: colors.text, fontSize: 16 },
});
