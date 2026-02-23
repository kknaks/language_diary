import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PronunciationResult as PronResult } from '../../types';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

interface PronunciationResultProps {
  result: PronResult;
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const barColor = score >= 80 ? colors.success : score >= 60 ? colors.warning : colors.error;

  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[styles.scoreValue, { color: barColor }]}>{score}</Text>
    </View>
  );
}

export default function PronunciationResultView({ result }: PronunciationResultProps) {
  const overallColor = result.overallScore >= 80
    ? colors.success
    : result.overallScore >= 60
      ? colors.warning
      : colors.error;

  return (
    <View style={styles.container}>
      <View style={styles.overallContainer}>
        <Text style={[styles.overallScore, { color: overallColor }]}>{result.overallScore}</Text>
        <Text style={styles.overallLabel}>종합 점수</Text>
      </View>

      <View style={styles.detailScores}>
        <ScoreBar label="정확도" score={result.accuracyScore} />
        <ScoreBar label="유창성" score={result.fluencyScore} />
        <ScoreBar label="완성도" score={result.completenessScore} />
      </View>

      <Text style={styles.feedback}>{result.feedback}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  overallContainer: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  overallScore: {
    fontSize: 48,
    fontWeight: '800',
  },
  overallLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailScores: {
    gap: spacing.sm,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scoreLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    width: 48,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.skeleton,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  scoreValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    width: 28,
    textAlign: 'right',
  },
  feedback: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
    textAlign: 'center',
  },
});
