import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../constants/theme';

export default function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="time-outline" size={64} color={colors.textTertiary} />
      <Text style={styles.title}>히스토리</Text>
      <Text style={styles.subtitle}>Sprint 4에서 구현 예정</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, gap: spacing.sm },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary },
});
