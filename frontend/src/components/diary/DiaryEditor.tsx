import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { colors, fontSize, spacing, borderRadius } from '../../constants/theme';
import Button from '../common/Button';

interface DiaryEditorProps {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function DiaryEditor({ initialText, onSave, onCancel, saving }: DiaryEditorProps) {
  const [text, setText] = useState(initialText);
  const hasChanged = text !== initialText;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        placeholder="일기를 수정하세요..."
        placeholderTextColor={colors.textTertiary}
        autoFocus
      />
      <View style={styles.actions}>
        <Button
          title="취소"
          onPress={onCancel}
          variant="ghost"
          size="sm"
          disabled={saving}
        />
        <Button
          title="저장"
          onPress={() => onSave(text)}
          size="sm"
          loading={saving}
          disabled={!hasChanged || saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.8,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    minHeight: 200,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
