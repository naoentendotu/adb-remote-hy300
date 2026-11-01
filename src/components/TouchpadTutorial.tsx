import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Button, Dialog, Text, View } from 'react-native-ui-lib';

import { radius, useThemed, type Colors } from '@/theme';

type Gesture = 'move' | 'tap' | 'scroll' | 'twoTap';

const STEPS: { gesture: Gesture; title: string; body: string }[] = [
  { gesture: 'move', title: 'Mover o cursor', body: 'Deslize um dedo na área. Devagar é preciso; rápido atravessa a tela.' },
  { gesture: 'tap', title: 'Clicar', body: 'Toque uma vez com um dedo. O botão Clique, embaixo, faz o mesmo.' },
  { gesture: 'scroll', title: 'Rolar', body: 'Deslize dois dedos para cima ou para baixo, como no notebook.' },
  { gesture: 'twoTap', title: 'Voltar', body: 'Toque com dois dedos ao mesmo tempo. É o clique direito, que no Android volta uma tela.' },
];

const PAD_W = 240;
const PAD_H = 140;
const FINGER = 26;
const LOOP_MS: Record<Gesture, number> = { move: 2400, tap: 1300, scroll: 1600, twoTap: 1300 };

/** One fingertip whose position, press and ripple follow the demo's 0..1 loop. */
function Finger({ t, gesture, offset }: { t: SharedValue<number>; gesture: Gesture; offset: number }) {
  const { styles } = useThemed(makeStyles);
  const tip = useAnimatedStyle(() => {
    const p = t.get();
    if (gesture === 'move') {
      return {
        opacity: 1,
        transform: [
          { translateX: interpolate(p, [0, 0.33, 0.66, 1], [30, 180, 110, 30]) },
          { translateY: interpolate(p, [0, 0.33, 0.66, 1], [30, 50, 95, 30]) },
        ],
      };
    }
    if (gesture === 'scroll') {
      return {
        opacity: interpolate(p, [0, 0.08, 0.7, 0.8, 1], [0, 1, 1, 0, 0]),
        transform: [{ translateX: 92 + offset }, { translateY: interpolate(p, [0, 0.7, 1], [100, 20, 20]) }],
      };
    }
    // tap / twoTap: press down, then lift
    return {
      opacity: 1,
      transform: [{ translateX: 107 + offset }, { translateY: 57 }, { scale: interpolate(p, [0, 0.12, 0.25, 1], [1, 0.72, 1, 1]) }],
    };
  });
  const ripple = useAnimatedStyle(() => {
    const p = t.get();
    const tap = gesture === 'tap' || gesture === 'twoTap';
    return {
      opacity: tap ? interpolate(p, [0.12, 0.6, 1], [0.55, 0, 0]) : 0,
      transform: [{ translateX: 107 + offset }, { translateY: 57 }, { scale: interpolate(p, [0.12, 0.6], [1, 2.6], 'clamp') }],
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.ripple, ripple]} />
      <Animated.View pointerEvents="none" style={[styles.finger, tip]} />
    </>
  );
}

function Demo({ gesture }: { gesture: Gesture }) {
  const { styles } = useThemed(makeStyles);
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    t.set(withRepeat(withTiming(1, { duration: LOOP_MS[gesture], easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [gesture, t]);
  const two = gesture === 'scroll' || gesture === 'twoTap';
  return (
    <View style={styles.pad} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Finger t={t} gesture={gesture} offset={two ? -18 : 0} />
      {two && <Finger t={t} gesture={gesture} offset={18} />}
    </View>
  );
}

/** Step-by-step gesture tour with animated fingers; opens by itself the first time, and from the (i) button. */
export function TouchpadTutorial({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, styles } = useThemed(makeStyles);
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const close = () => {
    onClose();
    setStep(0);
  };

  return (
    // `center`: ui-lib dialogs otherwise sit at the top of the screen.
    <Dialog visible={visible} onDismiss={close} center width="90%" containerStyle={styles.sheet}>
      <View padding-s5 gap-s4 center>
        <Text style={styles.title}>Como usar o touchpad</Text>
        <Animated.View key={step} entering={FadeIn.duration(220)} style={styles.step}>
          <Demo gesture={s.gesture} />
          <Text style={styles.stepTitle}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </Animated.View>
        <View row gap-s2 accessibilityLabel={`Passo ${step + 1} de ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View row spread centerV style={styles.actions}>
          <Button link label={last ? 'Rever' : 'Pular'} linkColor={colors.textMuted} labelStyle={styles.link} onPress={() => (last ? setStep(0) : close())} />
          <Button
            label={last ? 'Entendi' : 'Próximo'}
            borderRadius={radius.full}
            backgroundColor={colors.primary}
            color={colors.onPrimary}
            onPress={() => (last ? close() : setStep(step + 1))}
          />
        </View>
      </View>
    </Dialog>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    sheet: { backgroundColor: colors.surface, borderRadius: radius.md },
    title: { color: colors.text, fontSize: 18, fontWeight: '700' },
    step: { alignItems: 'center', gap: 10 },
    pad: { width: PAD_W, height: PAD_H, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.outline, overflow: 'hidden' },
    finger: { position: 'absolute', width: FINGER, height: FINGER, borderRadius: FINGER / 2, backgroundColor: colors.primary, opacity: 0.9 },
    ripple: { position: 'absolute', width: FINGER, height: FINGER, borderRadius: FINGER / 2, borderWidth: 2, borderColor: colors.primary },
    stepTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
    body: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', minHeight: 40 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.outline },
    dotOn: { width: 20, backgroundColor: colors.primary },
    actions: { alignSelf: 'stretch' },
    link: { fontSize: 15, fontWeight: '600' },
  });
