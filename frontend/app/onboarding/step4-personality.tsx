import { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants/theme';
import { useOnboardingStore } from '../../src/stores/useOnboardingStore';
import StepIndicator from '../../src/components/onboarding/StepIndicator';


export default function Step4Personality() {
  const onboardingStore = useOnboardingStore();
  const [empathy, setEmpathy] = useState(onboardingStore.empathy);
  const [intuition, setIntuition] = useState(onboardingStore.intuition);
  const [logic, setLogic] = useState(onboardingStore.logic);

  // 슬라이더 값이 바뀔 때마다 store에 저장 (꺽쇠로 이동해도 유지)
  useEffect(() => {
    onboardingStore.setPersonality(empathy, intuition, logic);
  }, [empathy, intuition, logic]);

  const handleComplete = () => {
    onboardingStore.setPersonality(empathy, intuition, logic);
    router.push('/onboarding/step5-level');
  };

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const incrementValue = (
    which: 'empathy' | 'intuition' | 'logic',
    delta: number,
  ) => {
    if (which === 'empathy') setEmpathy((v) => clamp(v + delta));
    else if (which === 'intuition') setIntuition((v) => clamp(v + delta));
    else setLogic((v) => clamp(v + delta));
  };

  return (
    <SafeAreaView style={styles.container}>
      <StepIndicator currentStep={4} totalSteps={5} />

      <View style={styles.content}>
        <Text style={styles.title}>어떤 성격의 친구가 좋나요?</Text>
        <Text style={styles.description}>
          슬라이더를 드래그하여 AI 친구의 성격을 조절하세요.
        </Text>

        <View style={styles.slidersContainer}>
          <PersonalityRow
            label="공감"
            emoji="❤️"
            value={empathy}
            color="#FF6B6B"
            onIncrement={() => incrementValue('empathy', 5)}
            onDecrement={() => incrementValue('empathy', -5)}
            onValueChange={setEmpathy}
          />
          <PersonalityRow
            label="직관"
            emoji="💡"
            value={intuition}
            color="#FFD93D"
            onIncrement={() => incrementValue('intuition', 5)}
            onDecrement={() => incrementValue('intuition', -5)}
            onValueChange={setIntuition}
          />
          <PersonalityRow
            label="논리"
            emoji="🧠"
            value={logic}
            color="#6BCB77"
            onIncrement={() => incrementValue('logic', 5)}
            onDecrement={() => incrementValue('logic', -5)}
            onValueChange={setLogic}
          />
        </View>

      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.completeButton}
          onPress={handleComplete}
          activeOpacity={0.7}
        >
          <Text style={styles.completeButtonText}>다음</Text>
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
  onValueChange,
}: {
  label: string;
  emoji: string;
  value: number;
  color: string;
  onIncrement: () => void;
  onDecrement: () => void;
  onValueChange: (v: number) => void;
}) {
  const trackWidth = useRef(0);
  const fillWidth = `${value}%` as const;

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const calcValue = (pageX: number, trackPageX: number) => {
    const x = pageX - trackPageX;
    const ratio = x / trackWidth.current;
    return clamp(Math.round(ratio * 100 / 5) * 5);
  };

  const trackRef = useRef<View>(null);
  const trackPageX = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        trackRef.current?.measure((_x, _y, _w, _h, pageX) => {
          trackPageX.current = pageX;
          onValueChange(calcValue(evt.nativeEvent.pageX, pageX));
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        onValueChange(calcValue(evt.nativeEvent.pageX, trackPageX.current));
      },
    }),
  ).current;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  };

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
        <View
          ref={trackRef}
          style={rowStyles.barTrack}
          onLayout={onTrackLayout}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              rowStyles.barFill,
              { width: fillWidth, backgroundColor: color },
            ]}
          />
          <View
            style={[
              rowStyles.thumb,
              { left: fillWidth, borderColor: color },
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
    overflow: 'visible',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  thumb: {
    position: 'absolute',
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    marginLeft: -12,
    ...shadows.sm,
  },
});
