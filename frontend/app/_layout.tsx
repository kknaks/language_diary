import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';
import DebugBanner, { debugLog } from '../src/components/common/DebugBanner';
import { env } from '../src/config/env';
import { useAuthStore } from '../src/stores/useAuthStore';

export default function RootLayout() {
  const { isLoading, isAuthenticated, isOnboarded, initializeFromStorage } = useAuthStore();

  useEffect(() => {
    debugLog('info', `API: ${env.API_BASE_URL}`);
    debugLog('info', `WS: ${env.WS_BASE_URL}`);
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      // S2에서 /login 라우트 생성 예정 — 현재는 기존 탭으로 진입
      // router.replace('/login');
      debugLog('info', 'Auth: not authenticated — staying on tabs (login route pending S2)');
    } else if (!isOnboarded) {
      // S2에서 /onboarding/step1-language 라우트 생성 예정
      // router.replace('/onboarding/step1-language');
      debugLog('info', 'Auth: not onboarded — staying on tabs (onboarding route pending S2)');
    } else {
      debugLog('info', 'Auth: authenticated & onboarded');
    }
  }, [isLoading, isAuthenticated, isOnboarded]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
