import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, SegmentedControl, Text, View } from 'react-native-ui-lib';
import Settings from 'lucide-react-native/icons/settings';

import { Field } from '@/components/Field';
import { SavedProjector } from '@/components/SavedProjector';
import { ThemeToggle, TopIcon, VibrationToggle } from '@/components/QuickToggles';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { useConnect } from '@/hooks/useConnect';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { parsePort, validateHost } from '@/services/adb/validation';
import { CARD_GAP, MONO, SCREEN_PAD, radius, useScheme, useThemed, type Colors } from '@/theme';
import type { ConnectionStatus } from '@/types/adb';

const LOGO = { light: require('../../assets/images/logo-horizontal.png'), dark: require('../../assets/images/logo-horizontal-dark.png') };
const BUSY: ConnectionStatus[] = ['checking-network', 'connecting', 'awaiting-auth', 'reconnecting'];
const openRemote = () => router.push('/remote');
const MODELS = ['hy300', 'hy320'] as const;

export default function HomeScreen() {
  const { colors, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const scheme = useScheme();
  const { client, state, setDemo, settings, updateSettings } = useAdbConnection();
  const connectAndSave = useConnect();
  const saved = settings.savedDevice;
  // Draft = what the user is typing; null means "show the saved device" (settings load asynchronously).
  const [draft, setDraft] = useState<{ host: string; port: string } | null>(null);
  const editing = draft !== null || !saved;
  const host = draft?.host ?? saved?.host ?? '';
  const port = draft?.port ?? saved?.port ?? '5555';

  const busy = BUSY.includes(state.status);
  const connected = state.status === 'connected';
  const hostError = validateHost(host);
  const portError = parsePort(port) === null ? 'Porta inválida (1–65535).' : null;
  const invalid = !!(hostError ?? portError);
  const isSaved = saved?.host === host.trim() && saved?.port === port.trim();

  // A fresh connection (form, saved card or demo) goes straight to the remote. Only while this screen is in
  // front, and not for auto-reconnects, so coming back here on purpose does not bounce you away.
  useFocusEffect(
    useCallback(() => {
      let prev = client.getState().status;
      return client.subscribe(() => {
        const { status } = client.getState();
        if (status === 'connected' && prev !== 'connected' && prev !== 'reconnecting') openRemote();
        prev = status;
      });
    }, [client]),
  );

  const connect = (h = host, p = port) => connectAndSave(h, p).then((ok) => ok && setDraft(null));

  return (
    <View flex style={styles.screen}>
      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.page, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled">
          <View row centerV right>
            <ThemeToggle />
            <VibrationToggle />
            <TopIcon icon={Settings} label="Configurações e diagnóstico" onPress={() => router.push('/diagnostics')} />
          </View>
          <Image source={LOGO[scheme]} style={styles.logo} resizeMode="contain" accessibilityLabel="Projex Remote" accessibilityRole="header" />
          <SegmentedControl
            segments={[{ label: 'HY300' }, { label: 'HY320' }]}
            initialIndex={MODELS.indexOf(settings.model)}
            onChangeIndex={(i: number) => updateSettings({ model: MODELS[i] })}
            backgroundColor={colors.surface}
            activeBackgroundColor={colors.primaryContainer}
            activeColor={colors.onPrimaryContainer}
            inactiveColor={colors.textMuted}
            outlineColor={colors.primary}
            style={styles.model}
          />

          {/* The fields sit lower, in the middle of the space left under the logo. */}
          <View style={styles.middle}>
            <SavedProjector onConnect={(h, p) => void connect(h, p)} />

            {busy ? (
              <Connecting status={state.status} port={state.port ?? Number(port)} onCancel={() => client.disconnect()} />
            ) : connected ? (
              <Animated.View key="connected" entering={FadeIn.duration(200)}>
                <Card padding-s5 gap-s3 enableShadow={false} borderRadius={radius.md} style={styles.card}>
                  <Text style={styles.title}>Conectado</Text>
                  <Button label="Abrir controle" size={Button.sizes.large} borderRadius={radius.full} backgroundColor={colors.primary} color={colors.onPrimary} labelStyle={styles.ctaLabel} style={styles.cta} onPress={openRemote} />
                </Card>
              </Animated.View>
            ) : (
              <Animated.View key="form" entering={FadeIn.duration(200)}>
                <Card padding-s5 gap-s3 enableShadow={false} borderRadius={radius.md} style={styles.card}>
                  <Text style={styles.title}>Conectar ao projetor</Text>
                  <Text style={styles.body}>Celular e projetor precisam estar na mesma rede Wi-Fi.</Text>
                  {state.status === 'error' && state.error && <Text style={styles.error}>{describeError(toAdbError(state.error))}</Text>}

                  {editing ? (
                    <>
                      <View row gap-s3>
                        <View flex-3>
                          <Field
                            mono
                            label="IP do projetor"
                            value={host}
                            placeholder="192.168.0.10"
                            onChangeText={(h: string) => setDraft({ host: h, port })}
                            keyboardType="decimal-pad"
                            autoCorrect={false}
                            accessibilityLabel="Endereço IP do projetor"
                            validationMessage={host.length > 0 && hostError ? hostError : undefined}
                          />
                        </View>
                        <View flex-1>
                          <Field
                            mono
                            label="Porta"
                            value={port}
                            onChangeText={(p: string) => setDraft({ host, port: p })}
                            keyboardType="number-pad"
                            accessibilityLabel="Porta TCP do ADB"
                            validationMessage={portError ?? undefined}
                          />
                        </View>
                      </View>
                      <Text style={styles.hint}>O IP aparece no projetor em Configurações → Rede → Wi-Fi.</Text>
                    </>
                  ) : (
                    <View row spread centerV style={styles.savedRow}>
                      <View>
                        <Text style={styles.hint}>Projetor salvo</Text>
                        <Text style={styles.savedHost}>
                          {host}:{port}
                        </Text>
                      </View>
                      <Button link label="Alterar" linkColor={colors.primary} labelStyle={styles.link} onPress={() => setDraft({ host, port })} />
                    </View>
                  )}

                  <Button
                    label="Conectar"
                    size={Button.sizes.large}
                    borderRadius={radius.full}
                    backgroundColor={colors.primary}
                    disabledBackgroundColor={colors.surfaceHigh}
                    color={invalid ? colors.textMuted : colors.onPrimary}
                    labelStyle={styles.ctaLabel}
                    style={styles.cta}
                    disabled={invalid}
                    onPress={() => void connect()}
                  />
                  {editing && !isSaved && !invalid && (
                    <Button
                      link
                      label="Salvar sem conectar"
                      linkColor={colors.primary}
                      labelStyle={styles.link}
                      onPress={() => {
                        updateSettings({ savedDevice: { host: host.trim(), port: port.trim() } });
                        setDraft(null);
                      }}
                    />
                  )}
                </Card>
              </Animated.View>
            )}

            {!busy && !connected && (
              <Card row centerV padding-s4 gap-s3 enableShadow={false} borderRadius={radius.md} style={styles.card}>
                <View flex>
                  <Text style={styles.rowLabel}>Modo demonstração</Text>
                  <Text style={styles.hint}>Simula o projetor, para conhecer o app sem ele.</Text>
                </View>
                <Button label="Experimentar" size={Button.sizes.medium} borderRadius={radius.full} outline outlineColor={colors.outline} color={colors.primary} onPress={() => setDemo(true)} />
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Connection progress: what the app is waiting for, step by step, with the one Cancel button. */
function Connecting({ status, port, onCancel }: { status: ConnectionStatus; port: number; onCancel: () => void }) {
  const { colors, styles } = useThemed(makeStyles);
  const portOk = status !== 'checking-network';
  const title = status === 'awaiting-auth' ? 'Aceite no projetor' : status === 'reconnecting' ? 'Reconectando' : 'Conectando';
  const body =
    status === 'awaiting-auth'
      ? 'Na tela do projetor, confirme “Permitir depuração USB?” com o controle físico.'
      : status === 'reconnecting'
        ? 'A rede oscilou. A sessão está sendo retomada.'
        : 'Procurando o projetor e abrindo a sessão ADB.';
  const step = (done: boolean, label: string) => (
    <View row centerV gap-s3 style={styles.step}>
      {done ? <View style={[styles.stepDot, { backgroundColor: colors.success }]} /> : <ActivityIndicator size="small" color={colors.primary} />}
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
  );
  return (
    <Animated.View key="busy" entering={FadeIn.duration(200)}>
      <Card padding-s5 gap-s3 enableShadow={false} borderRadius={radius.md} style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {step(portOk, portOk ? `Porta ${port} respondendo` : `Procurando a porta ${port}`)}
        {step(false, status === 'awaiting-auth' ? 'Aguardando autorização' : 'Abrindo sessão ADB')}
        <Button label="Cancelar" size={Button.sizes.large} borderRadius={radius.full} outline outlineColor={colors.outline} color={colors.icon} onPress={onCancel} />
      </Card>
    </Animated.View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    flex: { flex: 1 },
    page: { flexGrow: 1, paddingHorizontal: SCREEN_PAD, gap: CARD_GAP },
    logo: { width: 260, height: 76, alignSelf: 'center', marginTop: 8 },
    model: { alignSelf: 'center', minWidth: 220 },
    middle: { flexGrow: 1, justifyContent: 'center', gap: CARD_GAP, paddingVertical: 16 },
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    body: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
    hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
    savedRow: { backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: 14 },
    savedHost: { color: colors.text, fontSize: 17, fontWeight: '600', fontFamily: MONO },
    cta: { height: 52, marginTop: 4 },
    ctaLabel: { fontSize: 17, fontWeight: '700' },
    link: { fontSize: 15, fontWeight: '600' },
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
    step: { minHeight: 28 },
    stepDot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 5 },
  });
