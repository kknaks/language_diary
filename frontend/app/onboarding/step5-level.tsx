import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi } from '../../src/services/api';
import { profileApi } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { ProfileCreateRequest } from '../../src/types/profile';
import { CefrLevel } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';

// Group display order
const GROUP_ORDER = ['초급', '중급', '고급'];

export default function Step5Level() {
  const [levels, setLevels] = useState<CefrLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onboardingStore = useOnboardingStore();
  const setOnboarded = useAuthStore((s) => s.setOnboarded);

  useEffect(() => {
    loadLevels();
  }, []);

  const loadLevels = async () => {
    try {
      const data = await seedApi.getCefrLevels();
      // sort by sort_order
      const sorted = [...data].sort((a, b) => a.sort_order - b.sort_order);
      setLevels(sorted);
    } catch {
      Alert.alert('오류', 'CEFR 레벨 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedCode) {
      Alert.alert('선택 필요', '현재 실력을 선택해주세요.');
      return;
    }
    try {
      setSubmitting(true);
      onboardingStore.setCefrLevel(selectedCode);
      const payload = onboardingStore.toApiPayload() as ProfileCreateRequest;

      const result = await profileApi.createProfile(payload);
      if (result.access_token) {
        await setOnboarded(result.access_token);
      }
      onboardingStore.reset();
      router.replace('/(tabs)');
    } catch (e) {
      const message = e instanceof Error ? e.message : '프로필 생성에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setSubmitting(false);
    }
  };

  // Group levels by group field
  const groupedLevels = GROUP_ORDER.reduce<Record<string, CefrLevel[]>>((acc, group) => {
    acc[group] = levels.filter((l) => l.group === group);
    return acc;
  }, {});

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StepIndicator currentStep={5} totalSteps={5} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>현재 실력이 어느 정도인가요?</Text>
        <Text style={styles.description}>
          정확하지 않아도 괜찮아요. 나중에 변경할 수 있어요.
        </Text>

        {GROUP_ORDER.map((group, groupIndex) => {
          const groupLevels = groupedLevels[group];
          if (!groupLevels || groupLevels.length === 0) return null;

          return (
            <View key={group}>
              {groupIndex > 0 && <View style={styles.groupDivider} />}
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>{group}</Text>
              </View>
              {groupLevels.map((level) => (
                <TouchableOpacity
                  key={level.code}
                  style={[
                    styles.levelCard,
                    selectedCode === level.code && styles.levelCardSelected,
                  ]}
                  onPress={() => setSelectedCode(level.code)}
                  activeOpacity={0.7}
                >
                  <View style={styles.levelLeft}>
                    <View style={styles.levelHeader}>
                      <View style={styles.groupBadge}>
                        <Text style={styles.groupBadgeText}>{level.group}</Text>
                      </View>
                      <Text style={styles.levelCode}>{level.code}</Text>
                      <Text style={styles.levelName}>{level.name}</Text>
                    </View>
                    <Text style={styles.levelDescription} numberOfLines={2}>
                      {level.description}
                    </Text>
                  </View>
                  {selectedCode === level.code && (
                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          );
        })}

        {levels.length === 0 && (
          <Text style={styles.emptyText}>사용 가능한 레벨이 없습니다.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.completeButton, !selectedCode && styles.completeButtonDisabled]}
          onPress={handleComplete}
          disabled={submitting || !selectedCode}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.completeButtonText}>시작하기</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  groupDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  groupHeader: {
    marginBottom: spacing.sm,
  },
  groupLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  levelCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  levelCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  levelLeft: {
    flex: 1,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  groupBadge: {
    backgroundColor: colors.primaryLight + '30',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  groupBadgeText: {
    fontSize: fontSize.xs,
    color: colors.primaryDark,
    fontWeight: '500',
  },
  levelCode: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.text,
  },
  levelName: {
    fontSize: fontSize.sm,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  levelDescription: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    lineHeight: 16,
  },
  emptyText: {
    fontSize: fontSize.md,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  completeButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.md,
  },
  completeButtonDisabled: {
    backgroundColor: colors.border,
  },
  completeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
