import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';
import { Loading, ErrorState, ScreenHeader } from '../common';
import CardSwiper from './CardSwiper';
import LearningComplete from './LearningComplete';
import { getDiary, completeDiary, getPronunciationResults } from '../../services/api';
import { prefetchSpeechToken } from '../../hooks/usePronunciation';
import { Diary, PronunciationResult } from '../../types';

interface LearningViewProps {
  diaryId: number;
  onBack: () => void;
  onGoHome: () => void;
}

export default function LearningView({ diaryId, onBack, onGoHome }: LearningViewProps) {
  const [diary, setDiary] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [savedResults, setSavedResults] = useState<Record<number, Record<string, PronunciationResult | null>>>({});

  const fetchDiary = useCallback(async () => {
    if (!diaryId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiary(diaryId);
      setDiary(data);
      // 학습 시작 시 Speech 토큰 미리 캐싱 + 기존 발음 결과 로드
      prefetchSpeechToken().catch(() => {});
      const cardIds = (data.learning_cards ?? []).map((c) => c.id);
      if (cardIds.length > 0) {
        getPronunciationResults(cardIds).then((results) => {
          console.log('[LearningView] Loaded pronunciation results:', JSON.stringify(results));
          setSavedResults(results);
        }).catch((err) => {
          console.error('[LearningView] Failed to load pronunciation results:', err);
        });
      }
    } catch {
      setError('학습 데이터를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, [diaryId]);

  useEffect(() => {
    fetchDiary();
  }, [fetchDiary]);

  const cards = diary?.learning_cards ?? [];
  const totalCards = cards.length;

  const handleIndexChange = useCallback(
    (index: number) => {
      setCurrentIndex(index);
    },
    [],
  );

  const handleComplete = useCallback(async () => {
    if (diaryId) {
      try {
        await completeDiary(diaryId);
      } catch {
        // 이미 완료된 일기 — 무시
      }
    }
    setIsComplete(true);
  }, [diaryId]);

  const handleReviewAgain = useCallback(() => {
    setCurrentIndex(0);
    setIsComplete(false);
  }, []);

  const handleResultSaved = useCallback((cardId: number, section: string, result: PronunciationResult) => {
    setSavedResults((prev) => ({
      ...prev,
      [cardId]: { ...(prev[cardId] ?? {}), [section]: result },
    }));
  }, []);

  if (isLoading) return <Loading message="학습 카드를 준비하고 있어요..." />;
  if (error || !diary) return <ErrorState message={error ?? '데이터를 찾을 수 없습니다'} onRetry={fetchDiary} />;

  if (cards.length === 0) {
    return <ErrorState message="학습 포인트가 없습니다" />;
  }

  const countByType = (type: string) => cards.filter((c) => c.card_type === type).length;

  if (isComplete) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader
          title="학습 하기"
          left={
            <TouchableOpacity onPress={onBack} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          }
        />
        <LearningComplete
          wordCount={countByType('word')}
          phraseCount={countByType('phrase')}
          sentenceCount={countByType('sentence')}
          onGoHome={onGoHome}
          onReviewAgain={handleReviewAgain}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="학습 하기"
        left={
          <TouchableOpacity onPress={onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        }
      />

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
      </View>

      {/* Card swiper */}
      <View style={styles.swiperContainer}>
        <CardSwiper
          cards={cards}
          currentIndex={currentIndex}
          onIndexChange={handleIndexChange}
          onSwipePastEnd={handleComplete}
          savedResults={savedResults}
          onResultSaved={handleResultSaved}
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
