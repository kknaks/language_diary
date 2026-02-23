import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';
import { Message } from '../../types';

interface ChatBubbleProps {
  message: Message;
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={[styles.text, isUser ? styles.textUser : styles.textAi]}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowUser: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  bubbleAi: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderTopLeftRadius: borderRadius.sm / 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.sm / 2,
  },
  text: {
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
  },
  textAi: {
    color: colors.text,
  },
  textUser: {
    color: '#FFFFFF',
  },
});
