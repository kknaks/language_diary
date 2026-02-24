import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/theme';

interface MicButtonProps {
  isRecording: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const BUTTON_SIZE = 64;

export default function MicButton({ isRecording, disabled, onPress }: MicButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isRecording && styles.recording,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isRecording ? 'stop' : 'mic'}
        size={28}
        color={disabled ? colors.textTertiary : '#FFFFFF'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  recording: {
    backgroundColor: colors.secondary,
    borderWidth: 3,
    borderColor: colors.error,
  },
  disabled: {
    backgroundColor: colors.textTertiary,
  },
});
