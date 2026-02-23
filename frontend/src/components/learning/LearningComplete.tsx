import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../constants/theme';
import Button from '../common/Button';

interface LearningCompleteProps {
  wordCount: number;
  phraseCount: number;
  sentenceCount: number;
  onGoHome: () => void;
  onReviewAgain: () => void;
}

export default function LearningComplete({
  wordCount,
  phraseCount,
  sentenceCount,
  onGoHome,
  onReviewAgain,
}: LearningCompleteProps) {
  const totalCount = wordCount + phraseCount + sentenceCount;

  return (
    <View style={styles.container}>
      <View style={styles.celebrationIcon}>
        <Ionicons name="trophy" size={64} color={colors.warning} />
      </View>

      <Text style={styles.title}>학습 완료!</Text>
      <Text style={styles.subtitle}>오늘의 학습을 모두 마쳤어요</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>학습 요약</Text>
        <View style={styles.summaryRows}>
          <SummaryRow icon="text" label="단어" count={wordCount} color="#3B82F6" />
          <SummaryRow icon="chatbubble-ellipses" label="구문" count={phraseCount} color="#10B981" />
          <SummaryRow icon="document-text" label="문장" count={sentenceCount} color="#8B5CF6" />
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>총 학습</Text>
          <Text style={styles.totalCount}>{totalCount}개</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title="다시 복습하기"
          onPress={onReviewAgain}
          variant="outline"
          size="lg"
          style={styles.button}
        />
        <Button
          title="홈으로"
          onPress={onGoHome}
          size="lg"
          icon={<Ionicons name="home" size={18} color="#fff" />}
          style={styles.button}
        />
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, count, color }: { icon: string; label: string; count: number; color: string }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryRowLeft}>
        <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={color} />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={[styles.summaryCount, { color }]}>{count}개</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  celebrationIcon: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  summaryTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  summaryRows: {
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  summaryCount: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  totalCount: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
  },
  actions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    width: '100%',
  },
});
