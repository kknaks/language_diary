import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

interface TurnIndicatorProps {
  current: number;
  max: number;
}

export default function TurnIndicator({ current, max }: TurnIndicatorProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="chatbubbles-outline" size={14} color={colors.textSecondary} />
      <Text style={styles.text}>
        {current}/{max}턴
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 1,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
