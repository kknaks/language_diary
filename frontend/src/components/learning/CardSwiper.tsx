import React, { useRef, useCallback } from 'react';
import { View, FlatList, ScrollView, StyleSheet, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { LearningCard as LearningCardType, PronunciationResult } from '../../types';
import { spacing } from '../../constants/theme';
import LearningCard from './LearningCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface CardSwiperProps {
  cards: LearningCardType[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onSwipePastEnd?: () => void;
  savedResults?: Record<number, Record<string, PronunciationResult | null>>;
  onResultSaved?: (cardId: number, section: string, result: PronunciationResult) => void;
}

export default function CardSwiper({ cards, currentIndex, onIndexChange, onSwipePastEnd, savedResults, onResultSaved }: CardSwiperProps) {
  const flatListRef = useRef<FlatList<LearningCardType>>(null);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = e.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / SCREEN_WIDTH);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < cards.length) {
        onIndexChange(newIndex);
      }
    },
    [currentIndex, cards.length, onIndexChange],
  );

  // 마지막 카드에서 다음으로 스와이프 감지
  const handleScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (currentIndex === cards.length - 1) {
        const offsetX = e.nativeEvent.contentOffset.x;
        const maxOffset = (cards.length - 1) * SCREEN_WIDTH;
        // 마지막 카드 너머로 30px 이상 드래그하면 완료
        if (offsetX > maxOffset + 30) {
          onSwipePastEnd?.();
        }
      }
    },
    [currentIndex, cards.length, onSwipePastEnd],
  );

  const renderItem = useCallback(
    ({ item }: { item: LearningCardType }) => (
      <ScrollView
        style={styles.cardWrapper}
        contentContainerStyle={styles.cardContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <LearningCard card={item} savedResults={savedResults?.[item.id]} onResultSaved={onResultSaved} />
      </ScrollView>
    ),
    [savedResults, onResultSaved],
  );

  return (
    <FlatList
      ref={flatListRef}
      data={cards}
      renderItem={renderItem}
      keyExtractor={(item) => String(item.id)}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={handleMomentumEnd}
      onScrollEndDrag={handleScrollEndDrag}
      getItemLayout={(_, index) => ({
        length: SCREEN_WIDTH,
        offset: SCREEN_WIDTH * index,
        index,
      })}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: spacing.md,
  },
  cardWrapper: {
    width: SCREEN_WIDTH,
    paddingHorizontal: spacing.lg,
  },
  cardContent: {
    paddingBottom: spacing.xl,
  },
});
