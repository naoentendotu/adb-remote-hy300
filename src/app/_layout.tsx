import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors as UiColors } from 'react-native-ui-lib';

import { IntroSplash } from '@/components/IntroSplash';
import { AdbProvider } from '@/hooks/useAdbConnection';
import { useColors, useScheme } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <AdbProvider>
        <ThemedApp />
      </AdbProvider>
    </GestureHandlerRootView>
  );
}

/** Inside AdbProvider so the theme follows the saved setting. */
function ThemedApp() {
  const colors = useColors();
  const scheme = useScheme();
  // ui-lib reads its tokens at render time; switching here, above every screen, keeps its components in step.
  UiColors.setScheme(scheme);
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, primary: colors.primary },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'Projex Remote', headerShown: false }} />
        <Stack.Screen name="remote" options={{ title: 'Controle', headerShown: false }} />
        <Stack.Screen name="diagnostics" options={{ title: 'Configurações e Diagnóstico' }} />
      </Stack>
      <IntroSplash />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
