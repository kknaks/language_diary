import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fontSize, borderRadius } from '../../constants/theme';
import { LearningCard } from '../../types';

type CefrLevel = LearningCard['cefrLevel'];

const cefrColors: Record<CefrLevel, string> = {
  A1: '#10B981',
  A2: '#34D399',
  B1: '#3B82F6',
  B2: '#6366F1',
  C1: '#8B5CF6',
  C2: '#EC4899',
};

interface CefrBadgeProps {
  level: CefrLevel;
}

export default function CefrBadge({ level }: CefrBadgeProps) {
  const color = cefrColors[level];

  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }]}>
      <Text style={[styles.text, { color }]}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
