import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/HomeScreen';
import ConversationScreen from '../screens/ConversationScreen';
import HistoryScreen from '../screens/HistoryScreen';
import { RootTabParamList } from '../types';
import { colors, fontSize } from '../constants/theme';

const Tab = createBottomTabNavigator<RootTabParamList>();

const tabConfig: Record<string, { icon: keyof typeof Ionicons.glyphMap; iconFocused: keyof typeof Ionicons.glyphMap; label: string }> = {
  Home: { icon: 'home-outline', iconFocused: 'home', label: '홈' },
  Write: { icon: 'create-outline', iconFocused: 'create', label: '일기 쓰기' },
  History: { icon: 'time-outline', iconFocused: 'time', label: '히스토리' },
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
        tabBarStyle: { borderTopColor: colors.border, paddingTop: 4 },
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = tabConfig[route.name];
          return <Ionicons name={focused ? cfg.iconFocused : cfg.icon} size={size} color={color} />;
        },
        tabBarLabel: tabConfig[route.name]?.label,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Write" component={ConversationScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
    </Tab.Navigator>
  );
}
