import React, { useEffect, useRef } from 'react';
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
  processing: colors.warning,
};

const ORB_SIZE = 150;

export default function VoiceOrb({ volume, state }: VoiceOrbProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  // Pulse animation for idle state
  useEffect(() => {
    if (state === 'idle') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
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

  // Volume-driven scale animation
  useEffect(() => {
    const targetScale = 1 + volume * 0.8; // 0→1.0, 1→1.8
    Animated.timing(scaleAnim, {
      toValue: targetScale,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [volume, scaleAnim]);

  const orbColor = STATE_COLORS[state];
  const combinedScale = state === 'idle' ? pulseAnim : scaleAnim;
  const glowScale = Animated.multiply(combinedScale, 1.3);

  return (
    <View style={styles.container}>
      {/* Glow layer */}
      <Animated.View
        style={[
          styles.glow,
          {
            backgroundColor: orbColor,
            transform: [{ scale: glowScale }],
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
    width: ORB_SIZE * 2.4,
    height: ORB_SIZE * 2.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    opacity: 0.15,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
});
