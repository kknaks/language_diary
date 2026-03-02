import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, ViewStyle, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fontSize, spacing, borderRadius, shadows } from '../../constants/theme';
import { Button, Loading, ErrorState, ScreenHeader } from '../common';
import HighlightedText from './HighlightedText';
import LanguageToggle from './LanguageToggle';
import CefrBadge from '../learning/CefrBadge';
import { getDiary, getConversationMessages, getTaskStatus } from '../../services/api';
import { useDiaryStore } from '../../stores/useDiaryStore';
import { Diary, Message } from '../../types';

type Language = 'ko' | 'en';

interface DiaryDetailViewProps {
  diaryId: number;
  onBack: () => void;
  onStartLearning: (id: number) => void;
}

export default function DiaryDetailView({ diaryId, onBack, onStartLearning }: DiaryDetailViewProps) {
  const removeDiary = useDiaryStore((s) => s.removeDiary);

  const [diary, setDiary] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');

  // Conversation messages
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [showConversation, setShowConversation] = useState(false);

  // TTS task polling
  const [ttsReady, setTtsReady] = useState(false);
  const [ttsProgress, setTtsProgress] = useState<{ progress: number; total: number } | null>(null);
  const taskPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDiary = useCallback(async () => {
    if (!diaryId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiary(diaryId);
      setDiary(data);
      if (data.conversation_id) {
        try {
          const msgs = await getConversationMessages(String(data.conversation_id));
          setConversationMessages(msgs);
        } catch {
          // Non-critical
        }
      }
      const allReady = data.learning_cards.length > 0 &&
        data.learning_cards.every((c) => c.audio_url !== null && c.audio_url !== undefined);
      if (allReady) {
        setTtsReady(true);
      }
    } catch {
      setError('일기를 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, [diaryId]);

  const startTaskPolling = useCallback((taskId: string) => {
    if (taskPollingRef.current) clearInterval(taskPollingRef.current);

    taskPollingRef.current = setInterval(async () => {
      try {
        const task = await getTaskStatus(taskId);
        setTtsProgress({ progress: task.progress, total: task.total });

        if (task.status === 'completed') {
          if (taskPollingRef.current) clearInterval(taskPollingRef.current);
          taskPollingRef.current = null;
          setTtsReady(true);
          setTtsProgress(null);
          const refreshed = await getDiary(diaryId);
          setDiary(refreshed);
        } else if (task.status === 'failed') {
          if (taskPollingRef.current) clearInterval(taskPollingRef.current);
          taskPollingRef.current = null;
          setTtsProgress(null);
          setTtsReady(true);
        }
      } catch (err) {
        console.error(`[TTS Polling] Polling error:`, err);
      }
    }, 2000);
  }, [diaryId]);

  useEffect(() => {
    fetchDiary();
  }, [fetchDiary]);

  useEffect(() => {
    if (!diary) return;
    const allReady = diary.learning_cards.length > 0 &&
      diary.learning_cards.every((c) => c.audio_url !== null && c.audio_url !== undefined);
    if (allReady) {
      setTtsReady(true);
      return;
    }
    if (diary.task_id && !ttsReady) {
      startTaskPolling(diary.task_id);
    }
    return () => {
      if (taskPollingRef.current) {
        clearInterval(taskPollingRef.current);
      }
    };
  }, [diary?.task_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartLearning = useCallback(() => {
    if (!diaryId) return;
    onStartLearning(diaryId);
  }, [diaryId, onStartLearning]);

  const handleDelete = useCallback(() => {
    if (!diaryId) return;
    Alert.alert(
      '일기 삭제',
      '이 일기를 삭제하시겠습니까?\n삭제된 일기는 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await removeDiary(diaryId);
            onBack();
          },
        },
      ],
    );
  }, [diaryId, removeDiary, onBack]);

  if (isLoading) return <Loading message="일기를 불러오는 중..." />;
  if (error || !diary) return <ErrorState message={error ?? '일기를 찾을 수 없습니다'} onRetry={fetchDiary} />;

  const currentText = language === 'ko' ? diary.original_text : (diary.translated_text ?? '');
  const currentTitle = language === 'ko'
    ? (diary.title_original ?? diary.original_text?.split('\n')[0]?.slice(0, 30) ?? '')
    : (diary.title_translated ?? diary.translated_text?.split('\n')[0]?.slice(0, 30) ?? '');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="일기 상세"
        left={
          <TouchableOpacity onPress={onBack} hitSlop={8}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Language Toggle */}
        <LanguageToggle selected={language} onSelect={setLanguage} />

        {/* Title */}
        <Text style={styles.title} role="heading">{currentTitle}</Text>

        {/* Date */}
        <Text style={styles.date}>{formatDate(diary.created_at)}</Text>

        {/* Content */}
        <View style={styles.contentCard}>
          {language === 'en' && diary.learning_cards.length > 0 ? (
            <HighlightedText
              text={currentText}
              highlights={diary.learning_cards.map((c) => c.content_en)}
              textStyle={styles.contentText}
            />
          ) : (
            <Text style={styles.contentText}>{currentText}</Text>
          )}
        </View>

        {/* Conversation History */}
        {conversationMessages.length > 0 && (
          <View style={styles.section}>
            <TouchableHeader
              title="대화 기록"
              icon="chatbubbles-outline"
              isOpen={showConversation}
              onToggle={() => setShowConversation(!showConversation)}
              count={conversationMessages.length}
            />
            {showConversation && (
              <View style={styles.conversationList}>
                {conversationMessages.map((msg) => (
                  <View
                    key={msg.id}
                    style={[
                      styles.messageBubble,
                      msg.role === 'user' ? styles.userBubble : styles.aiBubble,
                    ]}
                  >
                    <Text style={styles.messageRole}>
                      {msg.role === 'user' ? '나' : 'AI'}
                    </Text>
                    <Text style={styles.messageText}>{msg.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Learning Cards Summary */}
        {diary.learning_cards.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLeft}>
                <Ionicons name="flash" size={20} color={colors.primary} />
                <Text style={styles.sectionTitle}>
                  학습 포인트 {diary.learning_cards.length}개
                </Text>
              </View>
            </View>

            {diary.learning_cards.map((card) => (
              <View key={card.id} style={styles.learningCardPreview}>
                <View style={styles.learningCardHeader}>
                  <Text style={styles.learningCardEnglish}>{card.content_en}</Text>
                  <CefrBadge level={card.cefr_level ?? 'A2'} />
                </View>
                <Text style={styles.learningCardKorean}>{card.content_ko}</Text>
              </View>
            ))}

            {ttsProgress && !ttsReady ? (
              <View style={styles.ttsProgressContainer}>
                <Ionicons name="hourglass-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.ttsProgressText}>
                  학습 오디오 준비 중... ({ttsProgress.progress}/{ttsProgress.total})
                </Text>
              </View>
            ) : null}
            <Button
              title={!ttsReady && diary.task_id ? '오디오 준비 중...' : '학습 시작'}
              onPress={handleStartLearning}
              size="lg"
              disabled={!ttsReady && !!diary.task_id}
              icon={
                !ttsReady && diary.task_id
                  ? <Ionicons name="hourglass-outline" size={20} color="#fff" />
                  : <Ionicons name="school" size={20} color="#fff" />
              }
              style={StyleSheet.flatten([styles.learningButton, (!ttsReady && !!diary.task_id) ? styles.learningButtonDisabled : undefined]) as ViewStyle}
            />
          </View>
        )}

        {/* Delete button */}
        <Button
          title="일기 삭제"
          onPress={handleDelete}
          variant="ghost"
          size="sm"
          icon={<Ionicons name="trash-outline" size={16} color={colors.error} />}
          textStyle={{ color: colors.error }}
          style={styles.deleteButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// Collapsible section header
function TouchableHeader({
  title,
  icon,
  isOpen,
  onToggle,
  count,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isOpen: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title} ({count})</Text>
      </View>
      <Button
        title={isOpen ? '접기' : '보기'}
        onPress={onToggle}
        variant="ghost"
        size="sm"
        icon={
          <Ionicons
            name={isOpen ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={colors.primary}
          />
        }
      />
    </View>
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
  scroll: {
    flex: 1,
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
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
  },
  conversationList: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  messageBubble: {
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.primary + '15',
    alignSelf: 'flex-end',
  },
  aiBubble: {
    backgroundColor: colors.skeleton,
    alignSelf: 'flex-start',
  },
  messageRole: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textTertiary,
    marginBottom: 2,
  },
  messageText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: fontSize.sm * 1.5,
  },
  learningCardPreview: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  learningCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  learningCardEnglish: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  learningCardKorean: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  learningButton: {
    width: '100%',
    marginTop: spacing.md,
  },
  deleteButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
  ttsProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  ttsProgressText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  learningButtonDisabled: {
    opacity: 0.6,
  },
});
