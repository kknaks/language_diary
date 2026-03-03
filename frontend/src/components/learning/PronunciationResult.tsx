import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { PronunciationResult as PronResult } from '../../types';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

interface PronunciationResultProps {
  result: PronResult;
  onRetry?: () => void;
}

const DONUT_SIZE = 160;
const STROKE_WIDTH = 16;
const RADIUS = (DONUT_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getScoreColor(score: number): string {
  if (score >= 80) return '#4CAF50';
  if (score >= 60) return '#FFC107';
  return '#F44336';
}

function DonutChart({ score }: { score: number }) {
  const color = getScoreColor(score);
  const progress = Math.min(score, 100) / 100;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={donutStyles.container}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
        <Circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={RADIUS}
          stroke="#E0E0E0"
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        <Circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}
        />
      </Svg>
      <View style={donutStyles.labelContainer}>
        <Text style={[donutStyles.score, { color }]}>{Math.round(score)}</Text>
      </View>
    </View>
  );
}

const donutStyles = StyleSheet.create({
  container: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontSize: 40,
    fontWeight: '800',
  },
});

function ScoreBar({ label, score }: { label: string; score: number }) {
  const barColor = getScoreColor(score);
  const rounded = Math.round(score);

  return (
    <View style={styles.scoreBarRow}>
      <View style={styles.scoreBarHeader}>
        <Text style={styles.scoreBarLabel}>{label}</Text>
        <Text style={styles.scoreBarValue}>
          <Text style={{ fontWeight: '700', color: barColor }}>{rounded}</Text>
          <Text style={{ color: colors.textTertiary }}> / 100</Text>
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export default function PronunciationResultView({ result, onRetry }: PronunciationResultProps) {
  return (
    <View style={styles.container}>
      {/* Section 1: 종합 결과 + 도넛 */}
      <Text style={styles.sectionTitle}>종합 결과</Text>
      <View style={styles.donutSection}>
        <DonutChart score={result.overallScore} />
      </View>

      <View style={styles.divider} />

      {/* Section 2: 상세 결과 */}
      <Text style={styles.sectionTitle}>상세 결과</Text>
      <View style={styles.detailSection}>
        <ScoreBar label="정확도" score={result.accuracyScore} />
        <ScoreBar label="유창성" score={result.fluencyScore} />
        <ScoreBar label="완성도" score={result.completenessScore} />
        <ScoreBar label="운율" score={result.overallScore} />
      </View>

      {/* Feedback */}
      {result.feedback ? (
        <Text style={styles.feedback}>{result.feedback}</Text>
      ) : null}

      {/* Retry button */}
      {onRetry && (
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh" size={18} color={colors.primary} />
          <Text style={styles.retryText}>다시 시도</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.md,
    width: '100%',
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  donutSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  detailSection: {
    gap: spacing.md,
  },
  scoreBarRow: {
    gap: 6,
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreBarLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  barTrack: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  scoreBarValue: {
    fontSize: fontSize.sm,
  },
  feedback: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  retryText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
});
