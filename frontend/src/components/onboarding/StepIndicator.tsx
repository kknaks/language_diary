import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fontSize } from '../../constants/theme';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export default function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
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
