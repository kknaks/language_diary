import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../../constants/theme';

interface NetworkBannerProps {
  isOffline: boolean;
}

export default function NetworkBanner({ isOffline }: NetworkBannerProps) {
  if (!isOffline) return null;

  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLabel="인터넷 연결이 끊어졌습니다">
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.text}>인터넷 연결이 끊어졌습니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
