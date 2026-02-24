import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { colors, fontSize, borderRadius, spacing } from '../../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export default function Button({
  title, onPress, variant = 'primary', size = 'md',
  loading, disabled, icon, style, textStyle,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.base, styles[variant], styles[`size_${size}`], isDisabled && styles.disabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      role="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, styles[`text_${variant}`], styles[`textSize_${size}`], textStyle]}>
            {title}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primary: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  secondary: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  size_sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  size_md: { paddingVertical: spacing.md - 2, paddingHorizontal: spacing.lg },
  size_lg: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.xl },
  disabled: { opacity: 0.5 },
  text: { fontWeight: '600' },
  text_primary: { color: '#fff' },
  text_secondary: { color: '#fff' },
  text_outline: { color: colors.primary },
  text_ghost: { color: colors.primary },
  textSize_sm: { fontSize: fontSize.sm },
  textSize_md: { fontSize: fontSize.md },
  textSize_lg: { fontSize: fontSize.lg },
});
