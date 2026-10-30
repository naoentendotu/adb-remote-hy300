import Projector from 'lucide-react-native/icons/projector';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { Button, Card, Text, View } from 'react-native-ui-lib';

import { useAdbConnection } from '@/hooks/useAdbConnection';
import { MONO, STATUS_COLOR, STATUS_LABEL, radius, useThemed, type Colors } from '@/theme';

/** Which projector, its address and live state. The status sits in its own badge so nothing is ever cut with "…". */
export function SavedProjector({ onConnect }: { onConnect?: (host: string, port: string) => void }) {
  const { colors, styles } = useThemed(makeStyles);
  const { client, state, settings, demo, setDemo } = useAdbConnection();
  const saved = settings.savedDevice;
  const live = state.status !== 'disconnected' && state.host;
  const host = live ? state.host! : saved?.host;
  const port = live ? String(state.port) : saved?.port;
  const idle = state.status === 'disconnected' || state.status === 'error';
  const tone = colors[STATUS_COLOR[state.status]];

  return (
    <Animated.View layout={LinearTransition.duration(220)}>
      <Card row centerV padding-s4 gap-s3 borderRadius={radius.md} enableShadow={false} style={styles.card}>
        <View center style={styles.icon}>
          <Projector size={24} color={colors.primary} strokeWidth={2} />
        </View>
        <View flex gap-s1>
          <Text style={styles.title}>{demo ? 'Modo Demo' : host ? (state.info?.model ?? 'Projetor salvo') : 'Nenhum projetor salvo'}</Text>
          {host ? (
            <>
              <Text style={styles.address}>
                {host}:{port}
              </Text>
              <Animated.View key={state.status} entering={FadeIn.duration(180)} style={[styles.badge, { borderColor: tone }]}>
                <View style={[styles.dot, { backgroundColor: tone }]} />
                <Text style={[styles.badgeText, { color: tone }]}>{STATUS_LABEL[state.status]}</Text>
              </Animated.View>
            </>
          ) : (
            <Text style={styles.sub}>Conecte uma vez e ele fica salvo aqui.</Text>
          )}
        </View>
        {state.status === 'connected' ? (
          <Button label="Sair" size={Button.sizes.small} borderRadius={radius.full} outline outlineColor={colors.outline} color={colors.icon} onPress={() => (demo ? setDemo(false) : void client.disconnect())} />
        ) : idle && host && onConnect ? (
          <Button
            label="Conectar"
            size={Button.sizes.small}
            borderRadius={radius.full}
            backgroundColor={colors.primary}
            color={colors.onPrimary}
            onPress={() => onConnect(host, port!)}
          />
        ) : null}
      </Card>
    </Animated.View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline },
    icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    address: { color: colors.textMuted, fontSize: 13, fontFamily: MONO },
    sub: { color: colors.textMuted, fontSize: 13 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 2,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    dot: { width: 6, height: 6, borderRadius: 3 },
    badgeText: { fontSize: 12, fontWeight: '600' },
  });
