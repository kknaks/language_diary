import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { profileApi } from '../../src/services/api';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { ProfileCreateRequest } from '../../src/types/profile';
import StepIndicator from '../../src/components/onboarding/StepIndicator';

const TOTAL = 100;

export default function Step4Personality() {
  const [empathy, setEmpathy] = useState(34);
  const [intuition, setIntuition] = useState(33);
  const [logic, setLogic] = useState(33);
  const [submitting, setSubmitting] = useState(false);

  const onboardingStore = useOnboardingStore();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const adjustValues = useCallback(
    (changed: 'empathy' | 'intuition' | 'logic', newValue: number) => {
      const rounded = Math.max(0, Math.min(100, Math.round(newValue)));
      const remaining = TOTAL - rounded;

      if (changed === 'empathy') {
        const otherTotal = intuition + logic;
        if (otherTotal === 0) {
          setEmpathy(rounded);
          setIntuition(Math.round(remaining / 2));
          setLogic(remaining - Math.round(remaining / 2));
        } else {
          const newIntuition = Math.round((intuition / otherTotal) * remaining);
          setEmpathy(rounded);
          setIntuition(newIntuition);
          setLogic(remaining - newIntuition);
        }
      } else if (changed === 'intuition') {
        const otherTotal = empathy + logic;
        if (otherTotal === 0) {
          setIntuition(rounded);
          setEmpathy(Math.round(remaining / 2));
          setLogic(remaining - Math.round(remaining / 2));
        } else {
          const newEmpathy = Math.round((empathy / otherTotal) * remaining);
          setIntuition(rounded);
          setEmpathy(newEmpathy);
          setLogic(remaining - newEmpathy);
        }
      } else {
        const otherTotal = empathy + intuition;
        if (otherTotal === 0) {
          setLogic(rounded);
          setEmpathy(Math.round(remaining / 2));
          setIntuition(remaining - Math.round(remaining / 2));
        } else {
          const newEmpathy = Math.round((empathy / otherTotal) * remaining);
          setLogic(rounded);
          setEmpathy(newEmpathy);
          setIntuition(remaining - newEmpathy);
        }
      }
    },
    [empathy, intuition, logic],
  );

  const handleComplete = async () => {
    if (!user) return;

    try {
      setSubmitting(true);
      onboardingStore.setPersonality(empathy, intuition, logic);
      const payload = onboardingStore.toApiPayload() as ProfileCreateRequest;
      payload.empathy = empathy;
      payload.intuition = intuition;
      payload.logic = logic;

      await profileApi.createProfile(payload);
      setUser({ ...user, onboarding_completed: true });
      onboardingStore.reset();
      router.replace('/(tabs)');
    } catch (e) {
      const message = e instanceof Error ? e.message : '프로필 생성에 실패했습니다.';
      Alert.alert('오류', message);
    } finally {
      setSubmitting(false);
    }
  };

  const incrementValue = (
    which: 'empathy' | 'intuition' | 'logic',
    delta: number,
  ) => {
    const current = which === 'empathy' ? empathy : which === 'intuition' ? intuition : logic;
    adjustValues(which, current + delta);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StepIndicator currentStep={4} totalSteps={4} />

      <View style={styles.content}>
        <Text style={styles.title}>어떤 성격의 친구가 좋나요?</Text>
        <Text style={styles.description}>
          버튼으로 AI 친구의 성격을 조절하세요.{'\n'}
          합계는 항상 100으로 유지됩니다.
        </Text>

        <View style={styles.slidersContainer}>
          <PersonalityRow
            label="공감"
            emoji="❤️"
            value={empathy}
            color="#FF6B6B"
            onIncrement={() => incrementValue('empathy', 5)}
            onDecrement={() => incrementValue('empathy', -5)}
          />
          <PersonalityRow
            label="직관"
            emoji="💡"
            value={intuition}
            color="#FFD93D"
            onIncrement={() => incrementValue('intuition', 5)}
            onDecrement={() => incrementValue('intuition', -5)}
          />
          <PersonalityRow
            label="논리"
            emoji="🧠"
            value={logic}
            color="#6BCB77"
            onIncrement={() => incrementValue('logic', 5)}
            onDecrement={() => incrementValue('logic', -5)}
          />
        </View>

        <View style={styles.totalContainer}>
          <Text style={styles.totalLabel}>합계</Text>
          <Text style={styles.totalValue}>{empathy + intuition + logic}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleComplete}
          disabled={submitting}
          activeOpacity={0.7}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.completeButtonText}>시작하기 🚀</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function PersonalityRow({
  label,
  emoji,
  value,
  color,
  onIncrement,
  onDecrement,
}: {
  label: string;
  emoji: string;
  value: number;
  color: string;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const fillWidth = `${value}%` as const;

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.header}>
        <Text style={rowStyles.label}>
          {emoji} {label}
        </Text>
        <Text style={[rowStyles.value, { color }]}>{value}</Text>
      </View>
      <View style={rowStyles.barRow}>
        <TouchableOpacity
          style={rowStyles.adjustButton}
          onPress={onDecrement}
          activeOpacity={0.6}
        >
          <Text style={rowStyles.adjustText}>−</Text>
        </TouchableOpacity>
        <View style={rowStyles.barTrack}>
          <View
            style={[
              rowStyles.barFill,
              { width: fillWidth, backgroundColor: color },
            ]}
          />
        </View>
        <TouchableOpacity
          style={rowStyles.adjustButton}
          onPress={onIncrement}
          activeOpacity={0.6}
        >
          <Text style={rowStyles.adjustText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
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
  slidersContainer: {
    gap: spacing.lg,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.primary,
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
  completeButtonText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

const rowStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.text,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  adjustButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjustText: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.text,
  },
  barTrack: {
    flex: 1,
    height: 12,
    backgroundColor: colors.border,
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
});
