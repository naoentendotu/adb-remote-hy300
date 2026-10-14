import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AdbProvider } from '@/hooks/useAdbConnection';
import { colors } from '@/theme';

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, text: colors.text, primary: colors.primary },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <AdbProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text, headerShadowVisible: false }}>
          <Stack.Screen name="index" options={{ title: 'Remote ADB Controller' }} />
          <Stack.Screen name="remote" options={{ title: 'Controle' }} />
          <Stack.Screen name="diagnostics" options={{ title: 'Diagnóstico' }} />
        </Stack>
      </AdbProvider>
    </ThemeProvider>
  );
}
