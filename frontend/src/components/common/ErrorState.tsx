import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../../constants/theme';
import Button from './Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = '문제가 발생했습니다', onRetry }: ErrorStateProps) {
  return (
    <View style={styles.container} role="alert" accessibilityLabel={message}>
      <Ionicons name="alert-circle-outline" size={56} color={colors.error} accessibilityElementsHidden />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button title="다시 시도" onPress={onRetry} variant="outline" size="sm" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
