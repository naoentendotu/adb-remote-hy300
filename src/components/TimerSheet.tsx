import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Dialog, Text, View } from 'react-native-ui-lib';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import type { SleepTimer } from '@/hooks/useSleepTimer';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { radius, useThemed, type Colors } from '@/theme';

const PRESETS = [15, 30, 60, 90, 120];
const RING = 176;
export const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const minutesLabel = (m: number) => (m % 60 === 0 ? `${m / 60} h` : m > 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m} min`);

/** Shared confirmation for both power buttons (remote tab and this sheet). */
export const askPowerOff = (onConfirm: () => void) =>
  Alert.alert('Desligar o projetor agora?', 'O projetor confirma sozinho e a conexão cai em seguida.', [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Desligar', style: 'destructive', onPress: onConfirm },
  ]);

export function TimerSheet({ visible, timer, onClose }: { visible: boolean; timer: SleepTimer; onClose: () => void }) {
  const { colors, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const { client, state, tick } = useAdbConnection();
  const [pick, setPick] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const enabled = state.status === 'connected' && !busy;
  const { remaining, total, dueAt } = timer;
  // Picking a time is also the preview; the clock is the live countdown once running.
  const frac = remaining ? remaining / (total ?? remaining) : pick / 120;
  // Fractional so the last lit tick fades out gradually instead of jumping once every total/60 seconds.
  const level = frac * 60;
  const lit = Math.round(level);

  useEffect(() => {
    if (!visible) return;
    // Keeps the "desliga às" preview current while the sheet stays open.
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [visible]);

  const run = async (fn: () => Promise<unknown>) => {
    tick();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(describeError(toAdbError(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      visible={visible}
      onDismiss={onClose}
      bottom
      width="100%"
      direction="down"
      containerStyle={styles.sheet}
      headerProps={{
        title: 'Temporizador',
        titleStyle: styles.title,
        subtitle: remaining ? 'Ativo no projetor' : 'Desliga o projetor depois do tempo escolhido',
        subtitleStyle: [styles.sub, remaining ? { color: colors.success } : null],
        showKnob: true,
        showDivider: false,
      }}>
      {/* Edge-to-edge Android draws the navigation bar over the sheet; ui-lib useSafeArea does not pad it. */}
      <View paddingH-s4 gap-s3 style={{ paddingBottom: insets.bottom + 20 }}>
        <View style={styles.ring} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 60, now: lit }}>
          {Array.from({ length: 60 }, (_, i) => (
            <View key={i} style={[StyleSheet.absoluteFill, styles.tickWrap, { transform: [{ rotate: `${i * 6}deg` }] }]}>
              <View style={[styles.tick, i % 5 === 0 && styles.tickMajor, { backgroundColor: colors.outline }]}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary, opacity: Math.min(1, Math.max(0, level - i)) }]} />
              </View>
            </View>
          ))}
          <Animated.View key={remaining ? 'run' : 'pick'} entering={FadeIn.duration(250)} style={styles.ringCenter}>
            <Text style={styles.big}>{remaining ? clock(remaining) : minutesLabel(pick)}</Text>
            <Text style={styles.sub}>
              {remaining ? (total ? `restantes de ${minutesLabel(total / 60)}` : 'restantes') : `desliga às ${hhmm(now + pick * 60_000)}`}
            </Text>
          </Animated.View>
        </View>

        {remaining && dueAt ? (
          <>
            <Card row spread padding-s4 enableShadow={false} borderRadius={radius.sm} style={styles.times}>
              <View>
                <Text style={styles.sub}>Iniciado às</Text>
                <Text style={styles.timeValue}>{total ? hhmm(dueAt - total * 1000) : '—'}</Text>
              </View>
              <View right>
                <Text style={styles.sub}>Desliga às</Text>
                <Text style={styles.timeValue}>{hhmm(dueAt)}</Text>
              </View>
            </Card>
            <Text center style={styles.sub}>
              Pode fechar o app ou desligar o celular: a contagem roda no próprio projetor.
            </Text>
            <Button
              label="Cancelar temporizador"
              size={Button.sizes.large}
              borderRadius={radius.full}
              outline
              outlineColor={colors.outline}
              color={colors.icon}
              disabled={!enabled}
              onPress={() => run(timer.cancel)}
            />
          </>
        ) : (
          <>
            <View row style={styles.presets}>
              {PRESETS.map((m) => {
                const on = m === pick;
                return (
                  <Pressable
                    key={m}
                    style={[styles.preset, on && styles.presetOn]}
                    onPress={() => setPick(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${m} minutos`}>
                    <Text style={[styles.presetValue, on && styles.presetOnText]}>{m}</Text>
                    <Text style={[styles.sub, on && styles.presetOnText]}>minutos</Text>
                  </Pressable>
                );
              })}
            </View>
            <Button
              label="Iniciar"
              size={Button.sizes.large}
              borderRadius={radius.full}
              backgroundColor={colors.primary}
              color={colors.onPrimary}
              disabled={!enabled}
              onPress={() => run(() => timer.schedule(pick))}
            />
          </>
        )}

        <Button
          label="Desligar agora"
          size={Button.sizes.large}
          borderRadius={radius.full}
          backgroundColor={colors.dangerContainer}
          disabledBackgroundColor={colors.dangerContainer}
          color={colors.danger}
          style={styles.danger}
          disabled={!enabled}
          onPress={() => askPowerOff(() => run(() => client.powerOff()).then(onClose))}
        />
        {state.status !== 'connected' && (
          <Text center style={styles.sub}>
            Conecte ao projetor para usar o temporizador.
          </Text>
        )}
        {error && (
          <Text center style={[styles.sub, { color: colors.danger }]}>
            {error}
          </Text>
        )}
      </View>
    </Dialog>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    // ui-lib Dialog defaults to maxHeight 60%, which clipped the power button once the timer is running.
    sheet: { maxHeight: '95%', backgroundColor: colors.surface, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
    title: { color: colors.text, fontSize: 20, fontWeight: '700' },
    sub: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
    ring: { width: RING, height: RING, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
    tickWrap: { alignItems: 'center' },
    tick: { width: 3, height: 9, borderRadius: 2, overflow: 'hidden' },
    tickMajor: { height: 15, width: 3.5 },
    ringCenter: { alignItems: 'center', gap: 2 },
    big: { color: colors.text, fontSize: 38, fontWeight: '600', fontVariant: ['tabular-nums'] },
    times: { backgroundColor: colors.surfaceHigh },
    timeValue: { color: colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
    presets: { flexWrap: 'wrap', gap: 10 },
    preset: {
      flexGrow: 1,
      flexBasis: '30%',
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: colors.surfaceHigh,
    },
    presetOn: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
    presetOnText: { color: colors.onPrimaryContainer },
    danger: { borderWidth: 1, borderColor: colors.dangerOutline },
    presetValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  });
