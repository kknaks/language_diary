import React, { useEffect, useMemo, useRef } from 'react';
import { View, Animated } from 'react-native';
import { colors } from '../../constants/theme';
import type { VoiceState } from '../../stores/useConversationStore';

type OrbSize = 'normal' | 'mini';

interface VoiceOrbProps {
  volume: number; // 0~1
  state: VoiceState;
  size?: OrbSize;
}

const STATE_COLORS: Record<VoiceState, string> = {
  idle: colors.textTertiary,
  listening: colors.primary,
  ai_speaking: '#8B5CF6',
};

const ORB_SIZES: Record<OrbSize, number> = {
  normal: 120,
  mini: 40,
};

export default function VoiceOrb({ volume, state, size = 'normal' }: VoiceOrbProps) {
  const ORB_SIZE = ORB_SIZES[size];
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

  const containerSize = size === 'mini' ? ORB_SIZE * 2 : ORB_SIZE * 2.8;

  return (
    <View style={{ width: containerSize, height: containerSize, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer glow */}
      <Animated.View
        style={{
          position: 'absolute',
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: ORB_SIZE / 2,
          backgroundColor: orbColor,
          opacity: glowOpacity,
          transform: [{ scale: glowScale }],
        }}
      />
      {/* Inner glow */}
      <Animated.View
        style={{
          position: 'absolute',
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: ORB_SIZE / 2,
          backgroundColor: orbColor,
          opacity: Animated.multiply(glowOpacity, 1.5),
          transform: [{ scale: state === 'idle'
            ? Animated.multiply(pulseAnim, 1.15)
            : Animated.multiply(scaleAnim, 1.15)
          }],
        }}
      />
      {/* Main orb */}
      <Animated.View
        style={{
          width: ORB_SIZE,
          height: ORB_SIZE,
          borderRadius: ORB_SIZE / 2,
          backgroundColor: orbColor,
          transform: [{ scale: combinedScale }],
          shadowColor: '#000',
          shadowOffset: { width: 0, height: size === 'mini' ? 2 : 4 },
          shadowOpacity: 0.25,
          shadowRadius: size === 'mini' ? 6 : 16,
          elevation: size === 'mini' ? 4 : 10,
        }}
      />
    </View>
  );
}
