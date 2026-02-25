import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDiaryStore } from '../../src/stores/useDiaryStore';
import { useAvatarStore } from '../../src/stores/useAvatarStore';
import { Button, Loading, ErrorState, EmptyState, ScreenHeader } from '../../src/components/common';
import DiaryCard from '../../src/components/diary/DiaryCard';
import { Live2DAvatar } from '../../src/components/conversation';
import { colors, fontSize, spacing, borderRadius } from '../../src/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { diaries, isLoading, error, fetchDiaries } = useDiaryStore();
  const { avatars, selectedAvatarId, fetchAvatars } = useAvatarStore();
  const [refreshing, setRefreshing] = React.useState(false);

  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId);

  useEffect(() => {
    fetchDiaries();
    fetchAvatars();
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <ScreenHeader title="안녕하세요" subtitle="오늘도 영어 일기를 써볼까요?" />

      {/* Avatar + CTA */}
      <View style={styles.avatarContainer}>
        <View style={styles.avatarPreview}>
          <Live2DAvatar voiceState="idle" volume={0} color={selectedAvatar?.primaryColor} />
        </View>
      </View>
      <View style={styles.ctaContainer}>
        <Button
          title="대화 시작하기"
          onPress={handleWrite}
          size="lg"
          icon={<Ionicons name="mic" size={20} color="#fff" />}
          style={styles.ctaButton}
        />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  avatarContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  avatarPreview: {
    width: 200,
    height: 200,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  ctaContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  ctaButton: {
    minWidth: 200,
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
