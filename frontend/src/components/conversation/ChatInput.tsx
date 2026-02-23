import React, { useState, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  interimText?: string;
}

export default function ChatInput({ onSend, disabled, interimText }: ChatInputProps) {
  const [text, setText] = useState('');
  const [inputMode, setInputMode] = useState<'keyboard' | 'mic'>('keyboard');

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const toggleMode = useCallback(() => {
    setInputMode((prev) => (prev === 'keyboard' ? 'mic' : 'keyboard'));
  }, []);

  const showInterim = inputMode === 'mic' && !!interimText;

  return (
    <View style={styles.container}>
      {/* Mic / Keyboard toggle */}
      <TouchableOpacity
        style={styles.modeButton}
        onPress={toggleMode}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Ionicons
          name={inputMode === 'keyboard' ? 'mic-outline' : 'keypad-outline'}
          size={24}
          color={disabled ? colors.textTertiary : colors.primary}
        />
      </TouchableOpacity>

      {/* Input area */}
      {inputMode === 'keyboard' ? (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="메시지를 입력하세요..."
          placeholderTextColor={colors.textTertiary}
          editable={!disabled}
          multiline
          maxLength={500}
          returnKeyType="default"
          blurOnSubmit={false}
        />
      ) : (
        <View style={styles.micArea}>
          {/* Mic button (UI only — audio recording in later sprint) */}
          <TouchableOpacity
            style={[styles.micButton, disabled && styles.micButtonDisabled]}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Ionicons name="mic" size={28} color={disabled ? colors.textTertiary : '#FFFFFF'} />
          </TouchableOpacity>
          {showInterim && (
            <TextInput
              style={[styles.input, styles.interimInput]}
              value={interimText}
              editable={false}
              multiline
            />
          )}
        </View>
      )}

      {/* Send button (keyboard mode) */}
      {inputMode === 'keyboard' && (
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || disabled) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
          activeOpacity={0.7}
        >
          <Ionicons
            name="send"
            size={20}
            color={!text.trim() || disabled ? colors.textTertiary : '#FFFFFF'}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  modeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm + 2 : spacing.sm,
    fontSize: fontSize.md,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  micArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonDisabled: {
    backgroundColor: colors.textTertiary,
  },
  interimInput: {
    flex: 1,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
});
