import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { VoiceState } from '../../stores/useConversationStore';

interface VoiceStatusProps {
  state: VoiceState;
  interimText?: string;
}

const STATE_LABELS: Record<VoiceState, string> = {
  idle: '탭해서 말하기',
  listening: '듣고 있어요...',
  ai_speaking: 'AI가 말하고 있어요...',
  processing: '생각하고 있어요...',
};

export default function VoiceStatus({ state, interimText }: VoiceStatusProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.stateText}>{STATE_LABELS[state]}</Text>
      {interimText ? (
        <Text style={styles.interimText} numberOfLines={2}>
          {interimText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  stateText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  interimText: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
});
