import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../../constants/theme';
import type { VoiceState } from '../../stores/useConversationStore';

interface VoiceOrbProps {
  volume: number; // 0~1
  state: VoiceState;
}

const STATE_COLORS: Record<VoiceState, string> = {
  idle: colors.textTertiary,
  listening: colors.primary,
  ai_speaking: '#8B5CF6',
};

const ORB_SIZE = 120;

export default function VoiceOrb({ volume, state }: VoiceOrbProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.15)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const scaleTimingRef = useRef<Animated.CompositeAnimation | null>(null);

  // Idle: gentle breathing pulse
  useEffect(() => {
    if (state === 'idle') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.95,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]),
      );
      pulseRef.current = loop;
      loop.start();
    } else {
      pulseRef.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseRef.current?.stop();
    };
  }, [state, pulseAnim]);

  // Volume-driven scale + glow animation
  useEffect(() => {
    scaleTimingRef.current?.stop();

    // More dramatic range: 0.85 ~ 1.6
    const targetScale = 0.85 + volume * 0.75;
    // Glow intensity follows volume
    const targetGlow = 0.1 + volume * 0.35;

    const anim = Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: targetScale,
        damping: 12,
        stiffness: 200,
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: targetGlow,
        duration: 80,
        useNativeDriver: true,
      }),
    ]);

    scaleTimingRef.current = anim;
    anim.start();

    return () => {
      scaleTimingRef.current?.stop();
    };
  }, [volume, scaleAnim, glowOpacity]);

  const orbColor = STATE_COLORS[state];
  const combinedScale = state === 'idle' ? pulseAnim : scaleAnim;

  const glowScaleIdle = useMemo(() => Animated.multiply(pulseAnim, 1.4), [pulseAnim]);
  const glowScaleActive = useMemo(() => Animated.multiply(scaleAnim, 1.4), [scaleAnim]);
  const glowScale = state === 'idle' ? glowScaleIdle : glowScaleActive;

  return (
    <View style={styles.container}>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.outerGlow,
          {
            backgroundColor: orbColor,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      {/* Inner glow */}
      <Animated.View
        style={[
          styles.innerGlow,
          {
            backgroundColor: orbColor,
            opacity: Animated.multiply(glowOpacity, 1.5),
            transform: [{ scale: state === 'idle'
              ? Animated.multiply(pulseAnim, 1.15)
              : Animated.multiply(scaleAnim, 1.15)
            }],
          },
        ]}
      />
      {/* Main orb */}
      <Animated.View
        style={[
          styles.orb,
          {
            backgroundColor: orbColor,
            transform: [{ scale: combinedScale }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: ORB_SIZE * 2.8,
    height: ORB_SIZE * 2.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerGlow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  innerGlow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
});
