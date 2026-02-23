import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';

type Language = 'ko' | 'en';

interface LanguageToggleProps {
  selected: Language;
  onSelect: (lang: Language) => void;
}

export default function LanguageToggle({ selected, onSelect }: LanguageToggleProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.tab, selected === 'ko' && styles.tabActive]}
        onPress={() => onSelect('ko')}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabText, selected === 'ko' && styles.tabTextActive]}>한국어</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, selected === 'en' && styles.tabActive]}
        onPress={() => onSelect('en')}
        activeOpacity={0.7}
      >
        <Text style={[styles.tabText, selected === 'en' && styles.tabTextActive]}>English</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.skeleton,
    borderRadius: borderRadius.md,
    padding: 3,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  tabActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  tabTextActive: {
    color: colors.primary,
  },
});
