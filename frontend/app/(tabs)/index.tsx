import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';

import { homeApi } from '../../src/services/api';
import { HomeResponse, HomeDiary } from '../../src/types/home';
import { useAvatarStore } from '../../src/stores/useAvatarStore';
import { Button, ScreenHeader } from '../../src/components/common';
import { DiaryDetailView } from '../../src/components/diary';
import { LearningView } from '../../src/components/learning';
import { Live2DAvatar } from '../../src/components/conversation';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';

type Screen = 'main' | 'diary' | 'learning';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day}`;
}

function statusLabel(status: string): { text: string; color: string } {
  switch (status) {
    case 'completed':
      return { text: '완료', color: colors.success };
    case 'draft':
      return { text: '임시', color: colors.warning };
    case 'in_progress':
      return { text: '진행 중', color: colors.primary };
    default:
      return { text: status, color: colors.textTertiary };
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const { avatars, selectedAvatarId, fetchAvatars } = useAvatarStore();
  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId);

  const [homeData, setHomeData] = useState<HomeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // State-based sub-screen navigation
  const [screen, setScreen] = useState<Screen>('main');
  const [selectedDiaryId, setSelectedDiaryId] = useState<number | null>(null);

  const loadHome = useCallback(async () => {
    try {
      setError(null);
      const data = await homeApi.getHome();
      setHomeData(data);
    } catch {
      setError('데이터를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHome();
      fetchAvatars();
    }, [loadHome, fetchAvatars]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHome();
    setRefreshing(false);
  }, [loadHome]);

  const handleWrite = () => {
    router.push('/(tabs)/write');
  };

  // Sub-screen rendering
  if (screen === 'learning' && selectedDiaryId) {
    return (
      <LearningView
        diaryId={selectedDiaryId}
        onBack={() => setScreen('diary')}
        onGoHome={() => setScreen('main')}
      />
    );
  }
  if (screen === 'diary' && selectedDiaryId) {
    return (
      <DiaryDetailView
        diaryId={selectedDiaryId}
        onBack={() => { setScreen('main'); setSelectedDiaryId(null); }}
        onStartLearning={() => setScreen('learning')}
      />
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="홈" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error && !homeData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="홈" />
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textTertiary} />
          <Text style={styles.errorText}>{error}</Text>
          <Button title="다시 시도" onPress={loadHome} variant="outline" />
        </View>
      </SafeAreaView>
    );
  }

  const user = homeData?.user;
  const avatar = homeData?.avatar;
  const recentDiaries = homeData?.recent_diaries ?? [];
  const stats = homeData?.stats;
  const nickname = user?.nickname ?? '사용자';
  const targetLang = user?.target_language;

  const avatarColor = avatar?.primary_color ?? selectedAvatar?.primaryColor ?? colors.primaryLight;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>안녕하세요, {nickname}님 👋</Text>
          {targetLang ? (
            <Text style={styles.subtitle}>{targetLang.name_native}로 일기를 써볼까요?</Text>
          ) : (
            <Text style={styles.subtitle}>오늘도 일기를 써볼까요?</Text>
          )}
        </View>

        {/* Avatar */}
        <View style={styles.avatarPreview}>
          <Live2DAvatar voiceState="idle" volume={0} color={avatarColor} modelUrl={avatar?.model_url ?? selectedAvatar?.modelUrl} />
        </View>

        {/* CTA */}
        <View style={styles.ctaContainer}>
          <Button
            title="대화 시작하기"
            onPress={handleWrite}
            size="lg"
            icon={<Ionicons name="mic" size={20} color="#fff" />}
            style={styles.ctaButton}
          />
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.total_diaries}</Text>
              <Text style={styles.statLabel}>총 일기</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.streak_days}</Text>
              <Text style={styles.statLabel}>연속 학습일</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons
                name={stats.today_completed ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={stats.today_completed ? colors.success : colors.textTertiary}
              />
              <Text style={styles.statLabel}>오늘 완료</Text>
            </View>
          </View>
        )}

        {/* Recent Diaries */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>최근 일기</Text>
        </View>

        {recentDiaries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="journal-outline" size={40} color={colors.textTertiary} />
            <Text style={styles.emptyText}>아직 일기가 없어요</Text>
            <Text style={styles.emptySubtext}>AI와 대화하며 첫 일기를 만들어보세요</Text>
          </View>
        ) : (
          recentDiaries.map((diary: HomeDiary) => {
            const badge = statusLabel(diary.status);
            return (
              <TouchableOpacity
                key={diary.id}
                style={styles.diaryItem}
                onPress={() => { setSelectedDiaryId(diary.id); setScreen('diary'); }}
                activeOpacity={0.7}
              >
                <View style={styles.diaryTop}>
                  <Text style={styles.diaryDate}>{formatDate(diary.created_at)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: badge.color + '20' }]}>
                    <Text style={[styles.statusText, { color: badge.color }]}>{badge.text}</Text>
                  </View>
                </View>
                <Text style={styles.diaryPreview} numberOfLines={2}>
                  {diary.original_text || diary.translated_text || '내용 없음'}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  loadingText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // Greeting
  greetingSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  greeting: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  // Avatar
  avatarPreview: {
    height: SCREEN_HEIGHT * 0.5,
    marginHorizontal: spacing.lg,
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
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  statItem: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  // Section
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  // Diary items
  diaryItem: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  diaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  diaryDate: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  diaryPreview: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.5,
  },
});
