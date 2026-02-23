import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Diary } from '../../types';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../constants/theme';

interface DiaryListItemProps {
  diary: Diary;
  onPress: () => void;
  onDelete: (id: string) => void;
}

const statusConfig = {
  draft: { label: '작성 중', color: colors.warning, icon: 'pencil' as const },
  completed: { label: '완료', color: colors.success, icon: 'checkmark-circle' as const },
  learning_done: { label: '학습 완료', color: colors.primary, icon: 'school' as const },
};

export default function DiaryListItem({ diary, onPress, onDelete }: DiaryListItemProps) {
  const status = statusConfig[diary.status];

  const handleLongPress = () => {
    Alert.alert(
      '일기 삭제',
      '이 일기를 삭제하시겠습니까?\n삭제된 일기는 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => onDelete(diary.id),
        },
      ],
    );
  };

  const time = new Date(diary.createdAt);
  const hours = time.getHours();
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const timeStr = `${period} ${displayHour}:${minutes}`;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
      delayLongPress={500}
      accessibilityRole="button"
      accessibilityLabel={`${diary.titleKo}, ${status.label}`}
      accessibilityHint="탭하여 상세 보기, 길게 누르면 삭제"
    >
      <View style={styles.row}>
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.time}>{timeStr}</Text>
            <View style={[styles.badge, { backgroundColor: status.color + '20' }]}>
              <Ionicons name={status.icon} size={10} color={status.color} />
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={styles.titleEn} numberOfLines={1}>{diary.titleEn}</Text>
          <Text style={styles.titleKo} numberOfLines={1}>{diary.titleKo}</Text>
          <Text style={styles.preview} numberOfLines={1}>{diary.contentEn}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>

      {diary.learningCards.length > 0 && (
        <View style={styles.footer}>
          <Ionicons name="flash" size={12} color={colors.primaryLight} />
          <Text style={styles.footerText}>학습 포인트 {diary.learningCards.length}개</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  titleEn: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  titleKo: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  preview: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
