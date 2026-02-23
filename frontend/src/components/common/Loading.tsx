import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
}

export default function Loading({ message = '로딩 중...', fullScreen = true }: LoadingProps) {
  return (
    <View style={[styles.container, fullScreen && styles.fullScreen]} accessibilityRole="progressbar" accessibilityLabel={message ?? '로딩 중'}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  message: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
});
