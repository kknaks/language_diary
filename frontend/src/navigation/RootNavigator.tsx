import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import { RootStackParamList } from '../types';
import { colors, fontSize } from '../constants/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { fontSize: fontSize.lg, fontWeight: '600' },
          headerBackTitle: '뒤로',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={TabNavigator} options={{ headerShown: false }} />
        {/* Sprint 3+에서 추가될 스택 스크린 */}
        {/* <Stack.Screen name="DiaryDetail" component={DiaryDetailScreen} options={{ title: '일기 상세' }} /> */}
        {/* <Stack.Screen name="Learning" component={LearningScreen} options={{ title: '학습' }} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
