import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { colors, fontSize } from '../src/constants/theme';

export default function RootLayout() {
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
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
