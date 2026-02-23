import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDiaryStore } from '../../src/stores/useDiaryStore';
import { Button, Loading, ErrorState, EmptyState } from '../../src/components/common';
import DiaryCard from '../../src/components/diary/DiaryCard';
import { colors, fontSize, spacing, shadows, borderRadius } from '../../src/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { diaries, isLoading, error, fetchDiaries } = useDiaryStore();
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    fetchDiaries();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchDiaries();
    setRefreshing(false);
  }, [fetchDiaries]);

  const handleWrite = () => {
    router.push('/(tabs)/write');
  };

  if (isLoading && diaries.length === 0) return <Loading message="일기를 불러오는 중..." />;
  if (error && diaries.length === 0) return <ErrorState message={error} onRetry={fetchDiaries} />;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header} accessibilityRole="header">
        <View>
          <Text style={styles.greeting}>안녕하세요</Text>
          <Text style={styles.headerSubtitle}>오늘도 영어 일기를 써볼까요?</Text>
        </View>
      </View>

      {/* CTA Button */}
      <View style={styles.ctaContainer}>
        <View style={styles.ctaCard}>
          <View style={styles.ctaContent}>
            <Ionicons name="chatbubbles" size={32} color={colors.primary} />
            <View style={styles.ctaText}>
              <Text style={styles.ctaTitle}>AI와 대화하기</Text>
              <Text style={styles.ctaDescription}>오늘 있었던 일을 이야기해보세요</Text>
            </View>
          </View>
          <Button
            title="시작하기"
            onPress={handleWrite}
            icon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          />
        </View>
      </View>

      {/* Recent Diaries */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>최근 일기</Text>
      </View>

      {diaries.length === 0 ? (
        <EmptyState
          icon="journal-outline"
          title="아직 일기가 없어요"
          description="AI와 대화하며 첫 일기를 만들어보세요"
          actionLabel="일기 쓰기"
          onAction={handleWrite}
        />
      ) : (
        <FlatList
          data={diaries}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DiaryCard diary={item} onPress={() => router.push(`/diary/${item.id}`)} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  greeting: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.text },
  headerSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 4,
  },
  ctaContainer: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  ctaContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ctaText: { flex: 1 },
  ctaTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  ctaDescription: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
});
