import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Diary } from '../../types';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';
import Card from '../common/Card';

interface DiaryCardProps {
  diary: Diary;
  onPress: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${month}월 ${day}일 (${weekdays[d.getDay()]})`;
}

const statusConfig = {
  draft: { label: '작성 중', color: colors.warning, icon: 'pencil' as const },
  completed: { label: '완료', color: colors.success, icon: 'checkmark-circle' as const },
  learning_done: { label: '학습 완료', color: colors.primary, icon: 'school' as const },
};

export default function DiaryCard({ diary, onPress }: DiaryCardProps) {
  const status = statusConfig[diary.status];

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{formatDate(diary.createdAt)}</Text>
        <View style={[styles.badge, { backgroundColor: status.color + '20' }]}>
          <Ionicons name={status.icon} size={12} color={status.color} />
          <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>{diary.titleEn}</Text>
      <Text style={styles.subtitle} numberOfLines={1}>{diary.titleKo}</Text>
      <Text style={styles.preview} numberOfLines={2}>{diary.contentEn}</Text>
      {diary.learningCards.length > 0 && (
        <View style={styles.footer}>
          <Ionicons name="flash" size={14} color={colors.primaryLight} />
          <Text style={styles.footerText}>학습 포인트 {diary.learningCards.length}개</Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textTertiary },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full },
  badgeText: { fontSize: fontSize.xs, fontWeight: '600' },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: 2 },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  preview: { fontSize: fontSize.sm, color: colors.textTertiary, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  footerText: { fontSize: fontSize.xs, color: colors.textSecondary },
});
