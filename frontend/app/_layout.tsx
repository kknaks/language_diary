import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';
import DebugBanner, { debugLog } from '../src/components/common/DebugBanner';
import { env } from '../src/config/env';

export default function RootLayout() {
  useEffect(() => {
    debugLog('info', `API: ${env.API_BASE_URL}`);
    debugLog('info', `WS: ${env.WS_BASE_URL}`);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <DebugBanner />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontSize: fontSize.lg, fontWeight: '600' },
          headerBackTitle: '뒤로',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="diary/[id]"
          options={{ title: '일기 상세' }}
        />
        <Stack.Screen
          name="learning/[id]"
          options={{ title: '학습', headerShown: false }}
        />
      </Stack>
    </View>
  );
}
