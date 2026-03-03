import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { WordHighlight } from '../../types';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

interface WordHighlightRowProps {
  words: WordHighlight[];
  showScores?: boolean;
}

function PulseWord({ word }: { word: string }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View style={[styles.wordBox, styles.wordSpeaking, { opacity }]}>
      <Text style={[styles.wordText, styles.wordTextSpeaking]}>{word}</Text>
    </Animated.View>
  );
}

const errorTypeStyles: Record<string, { color: string; decoration?: 'line-through' | 'underline'; border?: string }> = {
  Omission:        { color: '#4CAF50', decoration: 'line-through' },   // 생략 — 초록 + 취소선
  Insertion:       { color: '#F44336', decoration: 'underline' },      // 삽입 — 빨강 + 밑줄
  Mispronunciation:{ color: '#FFC107' },                                // 잘못된 발음 — 노랑
  UnexpectedBreak: { color: '#FFC107', border: '#FFC107' },            // 불필요한 멈춤 — 노랑 테두리
  MissingBreak:    { color: colors.textTertiary, border: colors.textTertiary }, // 누락된 멈춤 — 회색 테두리
  Monotone:        { color: '#9C27B0' },                                // 모노톤 — 보라
};

interface ScoreStyle {
  color: string;
  textDecorationLine?: 'line-through' | 'underline';
  borderColor?: string;
}

function getScoreStyle(score?: number, errorType?: string): ScoreStyle {
  // errorType이 있고 None이 아니면 에러 스타일 우선
  if (errorType && errorType !== 'None' && errorTypeStyles[errorType]) {
    const style = errorTypeStyles[errorType];
    return {
      color: style.color,
      textDecorationLine: style.decoration,
      borderColor: style.border,
    };
  }
  if (score == null) return { color: colors.textTertiary };
  if (score >= 80) return { color: colors.success };
  if (score >= 60) return { color: colors.warning };
  return { color: colors.error };
}

export default function WordHighlightRow({ words, showScores = false }: WordHighlightRowProps) {
  return (
    <View style={styles.container}>
      {words.map((wh, idx) => {
        if (wh.status === 'speaking') {
          return <PulseWord key={idx} word={wh.word} />;
        }

        const result: ScoreStyle | null = wh.status === 'done' ? getScoreStyle(wh.score, wh.errorType) : null;
        const bgStyle =
          result?.color
            ? { backgroundColor: result.color + '10' }
            : {};
        const borderStyle =
          result?.borderColor
            ? { borderWidth: 1.5, borderColor: result.borderColor }
            : {};

        return (
          <View key={idx} style={[styles.wordBox, bgStyle, borderStyle]}>
            <Text
              style={[
                styles.wordText,
                wh.status === 'pending' && styles.wordTextPending,
                result?.color ? { color: result.color } : {},
                result?.textDecorationLine ? { textDecorationLine: result.textDecorationLine } : {},
              ]}
            >
              {wh.word}
            </Text>
            {showScores && wh.status === 'done' && wh.score != null && (
              <Text style={[styles.scoreText, { color: result?.color ?? colors.textTertiary }]}>
                {Math.round(wh.score)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  wordBox: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  wordSpeaking: {
    backgroundColor: colors.primary + '20',
  },
  wordText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: fontSize.lg * 1.4,
  },
  wordTextPending: {
    color: colors.textTertiary,
  },
  wordTextSpeaking: {
    color: colors.primary,
  },
  scoreText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 1,
  },
});
