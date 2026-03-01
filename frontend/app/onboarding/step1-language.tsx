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
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { seedApi } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useOnboardingPrefetch } from '../../src/stores/useOnboardingPrefetch';
import { Language } from '../../src/types/seed';
import StepIndicator from '../../src/components/onboarding/StepIndicator';

export default function Step1Language() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const storedNativeId = useOnboardingStore((s) => s.native_language_id);
  const storedTargetId = useOnboardingStore((s) => s.target_language_id);
  const [nativeId, setNativeId] = useState<number | null>(storedNativeId);
  const [targetId, setTargetId] = useState<number | null>(storedTargetId);

  const setLanguages_ = useOnboardingStore((s) => s.setLanguages);
  const prefetchAvatars = useOnboardingPrefetch((s) => s.prefetchAvatars);

  useEffect(() => {
    loadLanguages();
    prefetchAvatars();
  }, []);

  const loadLanguages = async () => {
    try {
      const res = await seedApi.getLanguages();
      setLanguages(res.items.filter((l) => l.is_active));
    } catch {
      Alert.alert('오류', '언어 목록을 불러올 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  const prefetchVoices = useOnboardingPrefetch((s) => s.prefetchVoices);

  const handleNext = () => {
    if (nativeId == null || targetId == null) {
      Alert.alert('선택 필요', '모국어와 학습 언어를 모두 선택해주세요.');
      return;
    }
    setLanguages_(nativeId, targetId);
    prefetchVoices(nativeId);
    router.push('/onboarding/step2-avatar');
  };

  const nativeLanguages = languages.filter((l) => l.id !== targetId);
  const targetLanguages = languages.filter((l) => l.id !== nativeId);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StepIndicator currentStep={1} totalSteps={5} onNext={() => {
        if (nativeId != null && targetId != null) {
          setLanguages_(nativeId, targetId);
          prefetchVoices(nativeId);
        }
      }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>어떤 언어를 배우고 싶나요?</Text>

        <Text style={styles.sectionLabel}>모국어</Text>
        <View style={styles.languageGrid}>
          {nativeLanguages.map((lang) => (
            <TouchableOpacity
              key={lang.id}
              style={[
                styles.languageCard,
                nativeId === lang.id && styles.languageCardSelected,
              ]}
              onPress={() => {
                if (nativeId === lang.id) {
                  setNativeId(null);
                } else {
                  setNativeId(lang.id);
                  if (targetId === lang.id) setTargetId(null);
                }
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.languageText,
                  nativeId === lang.id && styles.languageTextSelected,
                ]}
              >
                {lang.name_native}
              </Text>
              <Text style={styles.languageCode}>{lang.code.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>학습 언어</Text>
        <View style={styles.languageGrid}>
          {targetLanguages.map((lang) => (
            <TouchableOpacity
              key={lang.id}
              style={[
                styles.languageCard,
                targetId === lang.id && styles.languageCardSelected,
              ]}
              onPress={() => {
                if (targetId === lang.id) {
                  setTargetId(null);
                } else {
                  setTargetId(lang.id);
                  if (nativeId === lang.id) setNativeId(null);
                }
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.languageText,
                  targetId === lang.id && styles.languageTextSelected,
                ]}
              >
                {lang.name_native}
              </Text>
              <Text style={styles.languageCode}>{lang.code.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.nextButton,
            (!nativeId || !targetId) && styles.nextButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={!nativeId || !targetId}
          activeOpacity={0.7}
        >
          <Text style={styles.nextButtonText}>다음</Text>
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
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  languageCard: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    minWidth: 100,
    ...shadows.sm,
  },
  languageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  languageText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  languageTextSelected: {
    color: colors.primary,
  },
  languageCode: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  nextButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadows.md,
  },
  nextButtonDisabled: {
    backgroundColor: colors.border,
  },
  nextButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
