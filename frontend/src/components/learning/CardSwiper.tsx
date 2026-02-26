import React, { useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { LearningCard as LearningCardType } from '../../types';
import { spacing } from '../../constants/theme';
import LearningCard from './LearningCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - spacing.lg * 2;

interface CardSwiperProps {
  cards: LearningCardType[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export default function CardSwiper({ cards, currentIndex, onIndexChange }: CardSwiperProps) {
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

  const renderItem = useCallback(
    ({ item }: { item: LearningCardType }) => (
      <View style={styles.cardWrapper}>
        <LearningCard card={item} />
      </View>
    ),
    [],
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
});
