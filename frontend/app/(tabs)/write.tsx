import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fontSize, spacing } from '../../src/constants/theme';
import { Button } from '../../src/components/common';
import {
  ChatBubble,
  ChatInput,
  TurnIndicator,
  TypingIndicator,
  ConnectionStatus,
  DiaryCreatingOverlay,
} from '../../src/components/conversation';
import { useConversationStore } from '../../src/stores/useConversationStore';
import { Message } from '../../src/types';

export default function WriteScreen() {
  const {
    sessionId,
    messages,
    turnCount,
    maxTurns,
    connectionStatus,
    isAiTyping,
    interimText,
    isCreatingDiary,
    createdDiary,
    isLoading,
    error,
    startConversation,
    sendMessage,
    finishConversation,
    reset,
  } = useConversationStore();

  const listRef = useRef<FlashListRef<Message>>(null);
  const isActive = !!sessionId && !createdDiary;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, isAiTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleFinish = useCallback(() => {
    finishConversation();
  }, [finishConversation]);

  const handleStartNew = useCallback(() => {
    reset();
  }, [reset]);

  // --- Idle state: show start conversation UI ---
  if (!sessionId && !isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.idleContainer}>
          <Ionicons name="chatbubbles-outline" size={72} color={colors.primaryLight} />
          <Text style={styles.idleTitle}>AI와 대화하기</Text>
          <Text style={styles.idleSubtitle}>
            오늘 하루에 대해 이야기하면{'\n'}AI가 영어 일기를 만들어드려요
          </Text>
          <Button
            title="대화 시작하기"
            onPress={startConversation}
            size="lg"
            icon={<Ionicons name="chatbubble-ellipses" size={20} color="#fff" />}
            style={styles.startButton}
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      </SafeAreaView>
    );
  }

  // --- Loading: creating session ---
  if (isLoading && !sessionId) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.idleContainer}>
          <Text style={styles.idleSubtitle}>대화를 준비하고 있어요...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- Diary created: show success ---
  if (createdDiary) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.idleContainer}>
          <Ionicons name="checkmark-circle" size={72} color={colors.success} />
          <Text style={styles.idleTitle}>일기가 완성되었어요!</Text>
          <Text style={styles.diaryPreview} numberOfLines={4}>
            {createdDiary.contentEn}
          </Text>
          <Button
            title="새 대화 시작하기"
            onPress={handleStartNew}
            size="lg"
            style={styles.startButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Active conversation ---
  const canFinish = turnCount >= 2 && connectionStatus === 'connected' && !isCreatingDiary;

  const renderItem = ({ item }: { item: Message }) => <ChatBubble message={item} />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Connection status banner */}
      <ConnectionStatus status={connectionStatus} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI 대화</Text>
        <TurnIndicator current={turnCount} max={maxTurns} />
      </View>

      {/* Message list */}
      <View style={styles.listWrapper}>
        <FlashList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={isAiTyping ? <TypingIndicator /> : null}
        />
      </View>

      {/* Finish button */}
      {isActive && (
        <View style={styles.finishRow}>
          <Button
            title="대화 완료"
            onPress={handleFinish}
            variant="outline"
            size="sm"
            disabled={!canFinish}
            icon={<Ionicons name="checkmark-done" size={16} color={canFinish ? colors.primary : colors.textTertiary} />}
          />
        </View>
      )}

      {/* Chat input */}
      <ChatInput
        onSend={handleSend}
        disabled={connectionStatus !== 'connected' || isCreatingDiary || isAiTyping}
        interimText={interimText}
      />

      {/* Diary creation overlay */}
      {isCreatingDiary && <DiaryCreatingOverlay />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Idle
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  idleTitle: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
  },
  idleSubtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.md * 1.6,
  },
  startButton: {
    marginTop: spacing.lg,
    minWidth: 200,
  },
  errorText: {
    fontSize: fontSize.sm,
    color: colors.error,
    marginTop: spacing.sm,
  },
  diaryPreview: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: fontSize.sm * 1.6,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  // List
  listWrapper: {
    flex: 1,
  },
  listContent: {
    paddingVertical: spacing.md,
  },
  // Finish
  finishRow: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
});
