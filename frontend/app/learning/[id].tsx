import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';
import { Loading, ErrorState } from '../../src/components/common';
import { CardSwiper, LearningComplete } from '../../src/components/learning';
import { getDiary, completeDiary } from '../../src/services/api';
import { Diary, LearningCard } from '../../src/types';

export default function LearningScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [diary, setDiary] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const fetchDiary = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiary(id);
      setDiary(data);
    } catch {
      setError('학습 데이터를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiary();
  }, [fetchDiary]);

  const cards = diary?.learningCards ?? [];
  const totalCards = cards.length;

  const handleIndexChange = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      if (index === totalCards - 1) {
        // Last card reached — mark complete after a moment
        setTimeout(() => setIsComplete(true), 500);
      }
    },
    [totalCards],
  );

  const handleComplete = useCallback(async () => {
    if (id) {
      await completeDiary(id);
    }
    setIsComplete(true);
  }, [id]);

  const handleGoHome = useCallback(() => {
    router.replace('/(tabs)');
  }, [router]);

  const handleReviewAgain = useCallback(() => {
    setCurrentIndex(0);
    setIsComplete(false);
  }, []);

  if (isLoading) return <Loading message="학습 카드를 준비하고 있어요..." />;
  if (error || !diary) return <ErrorState message={error ?? '데이터를 찾을 수 없습니다'} onRetry={fetchDiary} />;

  if (cards.length === 0) {
    return <ErrorState message="학습 포인트가 없습니다" />;
  }

  // Count by type
  const countByType = (type: LearningCard['type']) => cards.filter((c) => c.type === type).length;

  if (isComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <LearningComplete
          wordCount={countByType('word')}
          phraseCount={countByType('phrase')}
          sentenceCount={countByType('sentence')}
          onGoHome={handleGoHome}
          onReviewAgain={handleReviewAgain}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* English diary text at top */}
      <View style={styles.diarySection}>
        <Text style={styles.diaryText} numberOfLines={3}>
          {diary.contentEn}
        </Text>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {totalCards}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentIndex + 1) / totalCards) * 100}%` },
            ]}
          />
        </View>
        {currentIndex === totalCards - 1 && (
          <Text style={styles.completeHint} onPress={handleComplete}>
            완료
          </Text>
        )}
      </View>

      {/* Card swiper */}
      <View style={styles.swiperContainer}>
        <CardSwiper
          cards={cards}
          currentIndex={currentIndex}
          onIndexChange={handleIndexChange}
        />
      </View>

      {/* Swipe hint */}
      <Text style={styles.swipeHint}>← 스와이프하여 다음 카드 →</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  diarySection: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  diaryText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.6,
    fontStyle: 'italic',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  progressText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 40,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: colors.skeleton,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  completeHint: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.success,
  },
  swiperContainer: {
    flex: 1,
  },
  swipeHint: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    paddingBottom: spacing.md,
  },
});
