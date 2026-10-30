import { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Button, Text, View } from 'react-native-ui-lib';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import House from 'lucide-react-native/icons/house';
import Volume1 from 'lucide-react-native/icons/volume-1';
import Volume2 from 'lucide-react-native/icons/volume-2';
import VolumeX from 'lucide-react-native/icons/volume-x';

import { DirectionalPad } from '@/components/DirectionalPad';
import { RemoteButton, type IconName } from '@/components/RemoteButton';
import { uiIcon } from '@/components/uiIcon';
import { useAdbConnection } from '@/hooks/useAdbConnection';
import { describeError, toAdbError } from '@/services/adb/AdbErrors';
import { SCREEN_PAD, radius, useThemed, type Colors } from '@/theme';
import type { RemoteKey } from '@/types/adb';


export function RemotePanel({ enabled }: { enabled: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const { client, tick } = useAdbConnection();
  const [lastError, setLastError] = useState<string | null>(null);
  // The pad fills the width (up to 340) so the arrows are easy to hit in the dark.
  const padSize = Math.min(340, useWindowDimensions().width - 2 * SCREEN_PAD);

  const send = (key: RemoteKey, long = false) => {
    tick();
    setLastError(null);
    return (long ? client.longPressKey(key) : client.pressKey(key)).catch((e) => {
      const err = toAdbError(e);
      if (err.code !== 'CANCELLED') setLastError(describeError(err));
      throw err;
    });
  };
  const press = (key: RemoteKey) => () => void send(key).catch(() => {});
  const volume = (key: RemoteKey, icon: IconName, label: string) => (
    <Button
      round
      style={styles.volumeButton}
      backgroundColor="transparent"
      iconSource={uiIcon(icon, colors.icon, 26)}
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={press(key)}
    />
  );

  return (
    <View gap-s6 center>
      {lastError && <Text style={styles.error}>{lastError}</Text>}
      <DirectionalPad onKey={send} onLongKey={(k) => send(k, true)} enabled={enabled} size={padSize} />
      <View row gap-s10>
        <RemoteButton icon={ArrowLeft} label="Voltar" accessibilityLabel="Voltar" onPress={press('back')} disabled={!enabled} size={72} />
        <RemoteButton icon={House} label="Home" accessibilityLabel="Home" onPress={press('home')} disabled={!enabled} size={72} />
      </View>
      <View row centerV gap-s2>
        <View row centerV style={[styles.volume, !enabled && styles.disabled]}>
          {volume('volumeDown', Volume1, 'Volume −')}
          <View style={styles.sep} />
          {volume('mute', VolumeX, 'Mudo')}
          <View style={styles.sep} />
          {volume('volumeUp', Volume2, 'Volume +')}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
    volume: { borderRadius: radius.full, backgroundColor: colors.surfaceHigh, paddingHorizontal: 8, height: 68 },
    volumeButton: { width: 68, height: 56 },
    sep: { width: 1, height: 24, backgroundColor: colors.outline },
    disabled: { opacity: 0.4 },
  });
