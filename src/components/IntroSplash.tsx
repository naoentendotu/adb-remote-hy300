import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const BG = '#111315'; // same as the native splash in app.json, so the hand-off is seamless
const HOLD_MS = 900;

/** Short hand-off from the native splash: the horizontal logo fades in, then the whole layer fades away. */
export function IntroSplash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <Animated.View exiting={FadeOut.duration(300)} style={styles.screen} pointerEvents="none">
      <Animated.Image
        entering={FadeIn.duration(350)}
        source={require('../../assets/images/logo-horizontal-dark.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Projex Remote"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 220, height: 64 },
});
