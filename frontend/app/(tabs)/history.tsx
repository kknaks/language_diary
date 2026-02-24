import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDiaryStore } from '../../src/stores/useDiaryStore';
import { Loading, ErrorState, EmptyState } from '../../src/components/common';
import { DateHeader, DiaryListItem } from '../../src/components/history';
import { Diary } from '../../src/types';
import { colors, fontSize, spacing } from '../../src/constants/theme';

interface DiarySection {
  title: string;
  data: Diary[];
}

function groupByDate(diaries: Diary[]): DiarySection[] {
  const groups: Record<string, Diary[]> = {};
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const diary of diaries) {
    const d = new Date(diary.created_at);
    const key = formatSectionDate(d, today, yesterday);
    if (!groups[key]) groups[key] = [];
    groups[key].push(diary);
  }

  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

function formatSectionDate(date: Date, today: Date, yesterday: Date): string {
  if (isSameDay(date, today)) return '오늘';
  if (isSameDay(date, yesterday)) return '어제';

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[date.getDay()];

  if (year === today.getFullYear()) {
    return `${month}월 ${day}일 (${weekday})`;
  }
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function HistoryScreen() {
  const router = useRouter();
  const { diaries, isLoading, isLoadingMore, error, hasMore, fetchDiaries, fetchMore, removeDiary } =
    useDiaryStore();
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    fetchDiaries();
  }, []);

  const sections = useMemo(() => groupByDate(diaries), [diaries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDiaries();
    setRefreshing(false);
  }, [fetchDiaries]);

  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore) {
      fetchMore();
    }
  }, [hasMore, isLoadingMore, fetchMore]);

  const handleDiaryPress = useCallback(
    (id: string) => {
      router.push(`/diary/${id}`);
    },
    [router],
  );

  const handleDelete = useCallback(
    (id: string) => {
      removeDiary(id);
    },
    [removeDiary],
  );

  if (isLoading && diaries.length === 0) {
    return <Loading message="일기 목록을 불러오는 중..." />;
  }

  if (error && diaries.length === 0) {
    return <ErrorState message={error} onRetry={fetchDiaries} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>히스토리</Text>
        <Text style={styles.headerSubtitle}>
          {diaries.length > 0 ? `총 ${diaries.length}개의 일기` : ''}
        </Text>
      </View>

      {diaries.length === 0 ? (
        <EmptyState
          icon="journal-outline"
          title="아직 일기가 없어요"
          description="AI와 대화하며 첫 일기를 만들어보세요"
          actionLabel="일기 쓰기"
          onAction={() => router.push('/(tabs)/write')}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => <DateHeader title={section.title} />}
          renderItem={({ item }) => (
            <DiaryListItem
              diary={item}
              onPress={() => handleDiaryPress(item.id)}
              onDelete={handleDelete}
            />
          )}
          stickySectionHeadersEnabled={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          ListFooterComponent={
            isLoadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});
