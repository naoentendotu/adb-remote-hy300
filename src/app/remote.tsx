import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, View } from 'react-native-ui-lib';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Power from 'lucide-react-native/icons/power';
import Settings from 'lucide-react-native/icons/settings';
import Timer from 'lucide-react-native/icons/timer';

import { AppsPanel } from '@/components/AppsPanel';
import type { IconName } from '@/components/RemoteButton';
import { RemotePanel } from '@/components/RemotePanel';
import { TabBar, type Tab } from '@/components/TabBar';
import { TextInputPanel } from '@/components/TextInputPanel';
import { TouchpadPanel } from '@/components/TouchpadPanel';
import { ThemeToggle, TopIcon, VibrationToggle } from '@/components/QuickToggles';
import { askPowerOff, TimerSheet } from '@/components/TimerSheet';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { useSleepTimer } from '@/hooks/useSleepTimer';
import { CARD_GAP, SCREEN_PAD, radius, useThemed, type Colors } from '@/theme';

export default function RemoteScreen() {
  const { colors, styles } = useThemed(makeStyles);
  const insets = useSafeAreaInsets();
  const { client, state } = useAdbConnection();
  const [tab, setTab] = useState<Tab>('pad');
  const [timerOpen, setTimerOpen] = useState(false);
  const closeTimer = useCallback(() => setTimerOpen(false), []);
  const timer = useSleepTimer();
  const connected = state.status === 'connected';

  const action = (icon: IconName, label: string, onPress: () => void, tone?: 'danger') => (
    <Button
      round
      style={[styles.action, tone && styles.actionDanger]}
      backgroundColor={tone ? colors.dangerContainer : 'transparent'}
      iconSource={uiIcon(icon, tone ? colors.danger : colors.icon, 22)}
      accessibilityLabel={label}
      onPress={onPress}
    />
  );

  return (
    <View flex style={styles.screen}>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <View row centerV>
          {/* Back to the app's home; the session stays up (disconnect lives on the home screen's projector card). */}
          <TopIcon icon={ArrowLeft} label="Voltar para o início" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <View flex />
          <ThemeToggle />
          <VibrationToggle />
          <View>
            {action(Timer, timer.remaining ? 'Temporizador ativo' : 'Temporizador de desligamento', () => setTimerOpen(true))}
            {timer.remaining ? <View pointerEvents="none" style={styles.activeDot} /> : null}
          </View>
          {action(Settings, 'Configurações e diagnóstico', () => router.push('/diagnostics'))}
          {action(Power, 'Desligar projetor', () => askPowerOff(() => void client.powerOff().catch(() => {})), 'danger')}
        </View>
        <TabBar tab={tab} onChange={setTab} />
      </View>

      <KeyboardAvoidingView behavior="height" style={styles.flex}>
        <Animated.View key={tab} entering={FadeInDown.duration(220)} style={styles.flex}>
          <ScrollView
            contentContainerStyle={[styles.page, tab === 'pad' && styles.centered, { paddingBottom: insets.bottom + 32 }]}
            // The touchpad owns every drag; the page must not scroll under the finger.
            scrollEnabled={tab !== 'touch'}
            keyboardShouldPersistTaps="handled">
            {tab === 'pad' && <RemotePanel enabled={connected} />}
            {tab === 'text' && <TextInputPanel enabled={connected} />}
            {tab === 'touch' && <TouchpadPanel enabled={connected} />}
            {tab === 'apps' && <AppsPanel enabled={connected} />}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
      <TimerSheet visible={timerOpen} timer={timer} onClose={closeTimer} />
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { backgroundColor: colors.background },
    flex: { flex: 1 },
    // A little tighter than the page margin so the pill and five shortcuts share one row.
    top: { paddingHorizontal: 20, gap: CARD_GAP, paddingBottom: 8 },
    action: { width: 44, height: 44 },
    actionDanger: { borderWidth: 1, borderColor: colors.dangerOutline },
    activeDot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 9,
      height: 9,
      borderRadius: radius.full,
      backgroundColor: colors.success,
      borderWidth: 1.5,
      borderColor: colors.background,
    },
    page: { flexGrow: 1, paddingHorizontal: SCREEN_PAD, paddingTop: 8 },
    // Only the remote pad floats in the middle; keyboard and apps read top-down.
    centered: { justifyContent: 'center' },
  });
