import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';

interface DateHeaderProps {
  title: string;
}

export default function DateHeader({ title }: DateHeaderProps) {
  return (
    <View style={styles.container} accessibilityRole="header">
      <Text style={styles.text}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  text: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
