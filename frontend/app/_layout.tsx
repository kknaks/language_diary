import { useEffect } from 'react';
import { Stack, router, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';
import DebugBanner, { debugLog } from '../src/components/common/DebugBanner';
import { env } from '../src/config/env';
import { useAuthStore } from '../src/stores/useAuthStore';
import { useProfileStore } from '../src/stores/useProfileStore';

export default function RootLayout() {
  const { isLoading, isAuthenticated, isOnboarded, initializeFromStorage } = useAuthStore();
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const navigationState = useRootNavigationState();

  useEffect(() => {
    debugLog('info', `API: ${env.API_BASE_URL}`);
    debugLog('info', `WS: ${env.WS_BASE_URL}`);
    initializeFromStorage();
  }, [initializeFromStorage]);

  useEffect(() => {
    if (isLoading) return;
    if (!navigationState?.key) return;

    if (!isAuthenticated) {
      router.replace('/login');
      debugLog('info', 'Auth: not authenticated — redirecting to login');
    } else if (!isOnboarded) {
      router.replace('/onboarding/step1-language');
      debugLog('info', 'Auth: not onboarded — redirecting to onboarding');
    } else {
      fetchProfile();
      debugLog('info', 'Auth: authenticated & onboarded');
    }
  }, [isLoading, isAuthenticated, isOnboarded, navigationState?.key]);

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
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
