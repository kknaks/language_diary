import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';
import { Button, Loading, ErrorState } from '../../src/components/common';
import { DiaryEditor, LanguageToggle } from '../../src/components/diary';
import { getDiary, updateDiary } from '../../src/services/api';
import { Diary } from '../../src/types';

type Language = 'ko' | 'en';

export default function DiaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [diary, setDiary] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDiary = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiary(id);
      setDiary(data);
    } catch {
      setError('일기를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDiary();
  }, [fetchDiary]);

  const handleSave = useCallback(async (text: string) => {
    if (!diary || !id) return;
    setIsSaving(true);
    try {
      const field = language === 'ko' ? 'contentKo' : 'contentEn';
      const updated = await updateDiary(id, { [field]: text });
      setDiary(updated);
      setIsEditing(false);
    } catch {
      // Keep editing on error
    } finally {
      setIsSaving(false);
    }
  }, [diary, id, language]);

  const handleStartLearning = useCallback(() => {
    if (!id) return;
    router.push(`/learning/${id}`);
  }, [id, router]);

  if (isLoading) return <Loading message="일기를 불러오는 중..." />;
  if (error || !diary) return <ErrorState message={error ?? '일기를 찾을 수 없습니다'} onRetry={fetchDiary} />;

  const currentText = language === 'ko' ? diary.contentKo : diary.contentEn;
  const currentTitle = language === 'ko' ? diary.titleKo : diary.titleEn;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Language Toggle */}
      <LanguageToggle selected={language} onSelect={setLanguage} />

      {/* Title */}
      <Text style={styles.title}>{currentTitle}</Text>

      {/* Date */}
      <Text style={styles.date}>{formatDate(diary.createdAt)}</Text>

      {/* Content */}
      {isEditing ? (
        <DiaryEditor
          initialText={currentText}
          onSave={handleSave}
          onCancel={() => setIsEditing(false)}
          saving={isSaving}
        />
      ) : (
        <View style={styles.contentCard}>
          <Text style={styles.contentText}>{currentText}</Text>
          <Button
            title="수정하기"
            onPress={() => setIsEditing(true)}
            variant="ghost"
            size="sm"
            icon={<Ionicons name="pencil" size={16} color={colors.primary} />}
            style={styles.editButton}
          />
        </View>
      )}

      {/* Learning Cards Summary */}
      {diary.learningCards.length > 0 && (
        <View style={styles.learningSection}>
          <View style={styles.learningSummary}>
            <Ionicons name="flash" size={20} color={colors.primary} />
            <Text style={styles.learningSummaryText}>
              학습 포인트 {diary.learningCards.length}개
            </Text>
          </View>
          <Button
            title="학습 시작"
            onPress={handleStartLearning}
            size="lg"
            icon={<Ionicons name="school" size={20} color="#fff" />}
            style={styles.learningButton}
          />
        </View>
      )}
    </ScrollView>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${year}년 ${month}월 ${day}일 (${weekdays[d.getDay()]})`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.textTertiary,
  },
  contentCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  contentText: {
    fontSize: fontSize.md,
    color: colors.text,
    lineHeight: fontSize.md * 1.8,
  },
  editButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
  },
  learningSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
    marginTop: spacing.sm,
  },
  learningSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  learningSummaryText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  learningButton: {
    width: '100%',
  },
});
