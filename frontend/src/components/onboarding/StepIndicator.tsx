import { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, PanResponder } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize } from '../../constants/theme';

const STEP_ROUTES = [
  '/onboarding/step1-language',
  '/onboarding/step2-avatar',
  '/onboarding/step3-voice',
  '/onboarding/step4-personality',
  '/onboarding/step5-level',
] as const;

const SWIPE_THRESHOLD = 50;

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
}

export default function StepIndicator({ currentStep, totalSteps, onNext }: StepIndicatorProps) {
  const canGoBack = currentStep > 1;
  const canGoForward = currentStep < totalSteps;

  const goToPrev = () => {
    if (canGoBack) {
      router.back();
    }
  };

  const goToNext = () => {
    if (canGoForward) {
      onNext?.();
      router.push(STEP_ROUTES[currentStep] as never);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          goToPrev();
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          goToNext();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={goToPrev}
          disabled={!canGoBack}
          style={styles.chevron}
          activeOpacity={0.6}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={canGoBack ? colors.textSecondary : 'transparent'}
          />
        </TouchableOpacity>

        <View style={styles.dots}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i + 1 === currentStep && styles.dotActive,
                i + 1 < currentStep && styles.dotCompleted,
              ]}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={goToNext}
          disabled={!canGoForward}
          style={styles.chevron}
          activeOpacity={0.6}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={canGoForward ? colors.textSecondary : 'transparent'}
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.text}>
        {currentStep} / {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  chevron: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  dotCompleted: {
    backgroundColor: colors.primaryLight,
  },
  text: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
});
