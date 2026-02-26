import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSize, spacing, borderRadius, shadows } from '../../src/constants/theme';
import { Button, Loading, ErrorState } from '../../src/components/common';
import { DiaryEditor, LanguageToggle } from '../../src/components/diary';
import { CefrBadge } from '../../src/components/learning';
import { getDiary, updateDiary, getConversationMessages } from '../../src/services/api';
import { useDiaryStore } from '../../src/stores/useDiaryStore';
import { Diary, Message } from '../../src/types';

type Language = 'ko' | 'en';

export default function DiaryDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam);
  const router = useRouter();
  const removeDiary = useDiaryStore((s) => s.removeDiary);

  const [diary, setDiary] = useState<Diary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>('en');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Conversation messages
  const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
  const [showConversation, setShowConversation] = useState(false);

  const fetchDiary = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getDiary(id);
      setDiary(data);
      // Fetch conversation messages if available
      if (data.conversation_id) {
        try {
          const msgs = await getConversationMessages(String(data.conversation_id));
          setConversationMessages(msgs);
        } catch {
          // Non-critical: conversation messages are optional
        }
      }
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
      const field = language === 'ko' ? 'original_text' : 'translated_text';
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

  const handleDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      '일기 삭제',
      '이 일기를 삭제하시겠습니까?\n삭제된 일기는 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            await removeDiary(id);
            router.back();
          },
        },
      ],
    );
  }, [id, removeDiary, router]);

  if (isLoading) return <Loading message="일기를 불러오는 중..." />;
  if (error || !diary) return <ErrorState message={error ?? '일기를 찾을 수 없습니다'} onRetry={fetchDiary} />;

  const currentText = language === 'ko' ? diary.original_text : (diary.translated_text ?? '');
  const currentTitle = language === 'ko'
    ? (diary.original_text?.split('\n')[0]?.slice(0, 30) ?? '')
    : (diary.translated_text?.split('\n')[0]?.slice(0, 30) ?? '');

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Language Toggle */}
      <LanguageToggle selected={language} onSelect={setLanguage} />

      {/* Title */}
      <Text style={styles.title} role="heading">{currentTitle}</Text>

      {/* Date */}
      <Text style={styles.date}>{formatDate(diary.created_at)}</Text>

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

          {/* Learning card previews */}
          {diary.learning_cards.map((card) => (
            <View key={card.id} style={styles.learningCardPreview}>
              <View style={styles.learningCardHeader}>
                <Text style={styles.learningCardEnglish}>{card.content_en}</Text>
                <CefrBadge level={card.cefr_level ?? 'A2'} />
              </View>
              <Text style={styles.learningCardKorean}>{card.content_ko}</Text>
            </View>
          ))}

          <Button
            title="학습 시작"
            onPress={handleStartLearning}
            size="lg"
            icon={<Ionicons name="school" size={20} color="#fff" />}
            style={styles.learningButton}
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
  // Sections
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
  // Conversation messages
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
  // Learning card previews
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
  // Delete
  deleteButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
});
