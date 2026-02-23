import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '../../src/constants/theme';

type TabConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  label: string;
};

const tabConfig: Record<string, TabConfig> = {
  index: { icon: 'home-outline', iconFocused: 'home', label: '홈' },
  write: { icon: 'create-outline', iconFocused: 'create', label: '일기 쓰기' },
  history: { icon: 'time-outline', iconFocused: 'time', label: '히스토리' },
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' as const },
        tabBarStyle: { borderTopColor: colors.border, paddingTop: 4 },
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const cfg = tabConfig[route.name];
          if (!cfg) return null;
          return (
            <Ionicons
              name={focused ? cfg.iconFocused : cfg.icon}
              size={size}
              color={color}
            />
          );
        },
        tabBarLabel: tabConfig[route.name]?.label,
      })}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="write" />
      <Tabs.Screen name="history" />
    </Tabs>
  );
}
