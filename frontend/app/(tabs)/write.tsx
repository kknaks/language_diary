import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ExpoAudioStreamModule } from '@siteed/expo-audio-studio';

import { colors, fontSize, spacing } from '../../src/constants/theme';
import { Button } from '../../src/components/common';
import {
  TurnIndicator,
  ConnectionStatus,
  DiaryCreatingOverlay,
  VoiceOrb,
  VoiceStatus,
  MicButton,
} from '../../src/components/conversation';
import { useConversationStore } from '../../src/stores/useConversationStore';
import { useRealtimeRecorder } from '../../src/hooks/useRealtimeRecorder';

export default function WriteScreen() {
  const router = useRouter();
  const {
    sessionId,
    turnCount,
    maxTurns,
    connectionStatus,
    interimText,
    isCreatingDiary,
    createdDiary,
    isLoading,
    error,
    voiceState,
    volume,
    startConversation,
    prepareStreaming,
    bargeIn,
    finishConversation,
    setVoiceState,
    setVolume,
    clearError,
    reset,
  } = useConversationStore();

  const isActive = !!sessionId && !createdDiary;
  const fakeVolumeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isStreaming, startStreaming, stopStreaming } = useRealtimeRecorder();

  // Request mic permission on mount
  useEffect(() => {
    ExpoAudioStreamModule.requestPermissionsAsync();
  }, []);

  // Auto-stop streaming when VAD triggers stt_final (voiceState transitions away from 'listening')
  useEffect(() => {
    if (voiceState !== 'listening' && isStreaming) {
      stopStreaming();
    }
  }, [voiceState, isStreaming, stopStreaming]);

  // Fake volume simulation
  useEffect(() => {
    if (voiceState === 'listening' || voiceState === 'ai_speaking') {
      fakeVolumeRef.current = setInterval(() => {
        setVolume(0.2 + Math.random() * 0.6);
      }, 100);
    } else {
      setVolume(0);
      if (fakeVolumeRef.current) {
        clearInterval(fakeVolumeRef.current);
        fakeVolumeRef.current = null;
      }
    }
    return () => {
      if (fakeVolumeRef.current) {
        clearInterval(fakeVolumeRef.current);
        fakeVolumeRef.current = null;
      }
    };
  }, [voiceState, setVolume]);

  // Note: ai_speaking → idle transition is handled by playNextTts() in the store
  // when all TTS chunks finish playing.

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  const handleMicPress = useCallback(async () => {
    if (voiceState === 'listening') {
      // Manual stop — wait for stt_final from backend (VAD may have already committed)
      setVoiceState('processing');
      await stopStreaming();
    } else if (voiceState === 'ai_speaking') {
      // Barge-in: interrupt AI and start new input
      bargeIn();
      try {
        await startStreaming();
      } catch (err) {
        console.error('[Mic] Failed to start streaming after barge-in:', err);
        setVoiceState('idle');
      }
    } else if (voiceState === 'idle') {
      // Start real-time streaming
      const ok = prepareStreaming();
      if (!ok) return;
      try {
        await startStreaming();
      } catch (err) {
        console.error('[Mic] Failed to start streaming:', err);
        setVoiceState('idle');
      }
    }
  }, [voiceState, setVoiceState, prepareStreaming, bargeIn, startStreaming, stopStreaming]);

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
          <Ionicons name="mic-outline" size={72} color={colors.primaryLight} />
          <Text style={styles.idleTitle}>AI와 대화하기</Text>
          <Text style={styles.idleSubtitle}>
            오늘 하루에 대해 이야기하면{'\n'}AI가 영어 일기를 만들어드려요
          </Text>
          <Button
            title="대화 시작하기"
            onPress={startConversation}
            size="lg"
            icon={<Ionicons name="mic" size={20} color="#fff" />}
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
            {createdDiary.translated_text}
          </Text>
          <Button
            title="일기 확인하기"
            onPress={() => {
              const diaryId = createdDiary.id;
              reset();
              router.push(`/diary/${diaryId}`);
            }}
            size="lg"
            icon={<Ionicons name="document-text" size={18} color="#fff" />}
            style={styles.startButton}
          />
          <Button
            title="새 대화 시작하기"
            onPress={handleStartNew}
            variant="outline"
            size="lg"
            style={styles.startButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Active conversation: Voice Orb UI ---
  const canFinish = turnCount >= 2 && connectionStatus === 'connected' && !isCreatingDiary;
  const micDisabled = connectionStatus !== 'connected' || isCreatingDiary || voiceState === 'processing';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Connection status banner */}
      <ConnectionStatus status={connectionStatus} />

      {/* Error banner (dismissible) */}
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError} activeOpacity={0.8}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.errorBannerText} numberOfLines={2}>{error}</Text>
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI 대화</Text>
        <TurnIndicator current={turnCount} max={maxTurns} />
      </View>

      {/* Voice Orb area */}
      <View style={styles.orbArea}>
        <VoiceOrb volume={volume} state={voiceState} />
        <VoiceStatus state={voiceState} interimText={interimText} />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {isActive && (
          <Button
            title="대화 완료"
            onPress={handleFinish}
            variant="outline"
            size="sm"
            disabled={!canFinish}
            icon={<Ionicons name="checkmark-done" size={16} color={canFinish ? colors.primary : colors.textTertiary} />}
          />
        )}
        <MicButton
          isRecording={voiceState === 'listening'}
          disabled={micDisabled}
          onPress={handleMicPress}
        />
      </View>

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
  // Idle / Success
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.error,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: '#fff',
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
  // Voice Orb
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  // Bottom controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
});
