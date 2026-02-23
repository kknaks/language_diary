import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';
import { NetworkBanner } from '../src/components/common';
import useNetworkStatus from '../src/hooks/useNetworkStatus';

export default function RootLayout() {
  const { isOffline } = useNetworkStatus();

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <NetworkBanner isOffline={isOffline} />
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
