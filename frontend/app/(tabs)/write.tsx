import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { colors, fontSize, spacing } from '../../src/constants/theme';
import { Button, ScreenHeader } from '../../src/components/common';
import {
  DiaryCreatingOverlay,
  Live2DAvatar,
  VoiceOrb,
  VoiceStatus,
} from '../../src/components/conversation';
import { useConversationStore } from '../../src/stores/useConversationStore';
import { useAvatarStore } from '../../src/stores/useAvatarStore';
import { useRealtimeRecorder } from '../../src/hooks/useRealtimeRecorder';
import type { VADCallbacks } from '../../src/hooks/useRealtimeRecorder';

export default function WriteScreen() {
  const router = useRouter();
  const {
    sessionId,
    messages,
    interimText,
    isCreatingDiary,
    createdDiary,
    isLoading,
    error,
    voiceState,
    volume,
    startConversation,
    finishConversation,
    sendAudioChunk,
    sendBargeIn,
    sendNudge,
    setVolume,
    clearError,
    reset,
  } = useConversationStore();

  const { avatars, selectedAvatarId } = useAvatarStore();
  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId);

  const isActive = !!sessionId && !createdDiary;
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentAiMsgIdRef = useRef<string | null>(null);

  const { isStreaming, startStreaming, stopStreaming, forceRestart } = useRealtimeRecorder();

  // Keep refs for cleanup/callbacks to avoid effect dependency issues
  const stopStreamingRef = useRef(stopStreaming);
  stopStreamingRef.current = stopStreaming;
  const sendAudioChunkRef = useRef(sendAudioChunk);
  sendAudioChunkRef.current = sendAudioChunk;
  const sendNudgeRef = useRef(sendNudge);
  sendNudgeRef.current = sendNudge;
  const finishConversationRef = useRef(finishConversation);
  finishConversationRef.current = finishConversation;
  const startStreamingRef = useRef(startStreaming);
  startStreamingRef.current = startStreaming;
  const forceRestartRef = useRef(forceRestart);
  forceRestartRef.current = forceRestart;

  // Silence timeout: nudge after 10s, auto-finish after 2 nudges
  const SILENCE_TIMEOUT_MS = 10000;
  const MAX_NUDGES = 2;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeCountRef = useRef(0);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (voiceStateRef.current !== 'listening') return;
      nudgeCountRef.current++;
      console.log(`[Silence] Timeout #${nudgeCountRef.current}/${MAX_NUDGES}`);
      if (nudgeCountRef.current >= MAX_NUDGES) {
        console.log('[Silence] Max nudges reached, finishing conversation');
        finishConversationRef.current();
      } else {
        sendNudgeRef.current();
      }
    }, SILENCE_TIMEOUT_MS);
  }, [clearSilenceTimer]);

  // Track voiceState in a ref for VAD callbacks
  const voiceStateRef = useRef(voiceState);
  voiceStateRef.current = voiceState;

  // VAD callbacks — stable refs to avoid re-creating
  const vadCallbacksRef = useRef<VADCallbacks>({
    onSpeechStart: () => {
      const currentVoiceState = voiceStateRef.current;

      // ai_speaking 중 barge-in 제거 (끼어들기 버튼으로 대체)
      if (currentVoiceState === 'listening') {
        // User spoke — reset silence nudge counter and timer
        nudgeCountRef.current = 0;
        clearSilenceTimer();
      }
    },
    onSpeechEnd: () => {
      const currentVoiceState = voiceStateRef.current;

      if (currentVoiceState === 'listening') {
        // Speech ended while listening — start silence timer
        startSilenceTimer();
      }
    },
    onEnergy: (energy: number) => {
      const currentVoiceState = voiceStateRef.current;
      if (currentVoiceState === 'listening') {
        useConversationStore.getState().setVolume(energy);
      }
    },
  });

  // Auto-start mic streaming when connected
  const micStartedRef = useRef(false);
  const prevVoiceStateRef = useRef(voiceState);
  useEffect(() => {
    const prevState = prevVoiceStateRef.current;
    prevVoiceStateRef.current = voiceState;

    if ((voiceState === 'listening' || voiceState === 'ai_speaking') && !micStartedRef.current) {
      // First time: start mic with VAD
      micStartedRef.current = true;
      console.log('[Write] Starting mic stream with VAD, voiceState:', voiceState);
      startStreamingRef.current(
        (base64) => {
          // AI 말하는 중에는 오디오 전송 차단 (에코 게이트)
          if (voiceStateRef.current !== 'ai_speaking') {
            sendAudioChunkRef.current(base64);
          }
        },
        vadCallbacksRef.current,
      ).catch((err) => {
        console.error('[Mic] Failed to start streaming:', err);
        micStartedRef.current = false;
      });
    } else if (voiceState === 'listening' && prevState === 'ai_speaking') {
      // AI finished speaking → force restart mic (iOS likely killed it)
      console.log('[Write] AI done speaking, force restarting mic');
      forceRestartRef.current().catch((err) => {
        console.error('[Mic] Force restart failed:', err);
      });
      // Start silence timer — nudge if user doesn't respond within 10s
      startSilenceTimer();
    } else if (voiceState === 'listening' && prevState === 'idle') {
      // Initial listening state (after greeting) — start silence timer
      startSilenceTimer();
    } else if (voiceState === 'ai_speaking') {
      // AI is speaking — clear silence timer
      clearSilenceTimer();
      // 지금 막 시작된 AI 메시지 id 저장
      const lastAi = [...messages].reverse().find(m => m.role === 'assistant');
      currentAiMsgIdRef.current = lastAi?.id ?? null;
    } else if (voiceState === 'idle') {
      micStartedRef.current = false;
      clearSilenceTimer();
    }
  }, [voiceState, startSilenceTimer, clearSilenceTimer]);

  // Volume animation — only fake for ai_speaking, listening uses real mic energy from VAD
  useEffect(() => {
    if (voiceState === 'ai_speaking') {
      volumeIntervalRef.current = setInterval(() => {
        setVolume(0.3 + Math.random() * 0.5);
      }, 100);
    } else if (voiceState === 'idle') {
      setVolume(0);
    }
    // listening: volume is set by VAD onEnergy callback
    return () => {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
    };
  }, [voiceState, setVolume]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      clearSilenceTimer();
      stopStreamingRef.current();
      useConversationStore.getState().reset();
    };
  }, [clearSilenceTimer]);

  const handleFinish = useCallback(async () => {
    await stopStreaming();
    finishConversation();
  }, [finishConversation, stopStreaming]);

  const handleStartNew = useCallback(() => {
    reset();
  }, [reset]);

  // --- Idle state: show start conversation UI ---
  if (!sessionId && !isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader title="일기 쓰기" />
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
        <ScreenHeader title="일기 쓰기" />
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
        <ScreenHeader title="일기 쓰기" />
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
  const canFinish = messages.length >= 2 && !isCreatingDiary;

  // 현재 voiceState 기준으로 표시할 메시지 필터링
  const visibleMessages = (() => {
    if (voiceState === 'ai_speaking') {
      // 지금 말하고 있는 AI 메시지만
      const current = messages.find(m => m.id === currentAiMsgIdRef.current);
      return current ? [current] : [];
    }
    // listening / idle: 말풍선 히스토리 표시 안 함
    return [];
  })();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Error banner (dismissible) */}
      {error && (
        <TouchableOpacity style={styles.errorBanner} onPress={clearError} activeOpacity={0.8}>
          <Ionicons name="alert-circle" size={16} color="#fff" />
          <Text style={styles.errorBannerText} numberOfLines={2}>{error}</Text>
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Header with mini VoiceOrb */}
      <ScreenHeader
        title="일기 쓰기"
        right={<VoiceOrb volume={volume} state={voiceState} size="mini" />}
      />

      {/* Live2D Avatar area */}
      <View style={styles.avatarArea}>
        <Live2DAvatar voiceState={voiceState} volume={volume} color={selectedAvatar?.primaryColor} modelUrl={selectedAvatar?.modelUrl} />
      </View>

      {/* Message bubbles (dev) */}
      <ScrollView style={styles.messageArea} contentContainerStyle={styles.messageContent}>
        {visibleMessages.map((msg) => (
          <View
            key={msg.id}
            style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}
          >
            <Text style={[styles.bubbleText, msg.role === 'user' ? styles.userBubbleText : styles.aiBubbleText]}>
              {msg.content}
            </Text>
          </View>
        ))}
        {voiceState === 'listening' && interimText ? (
          <View style={[styles.bubble, styles.userBubble, styles.interimBubble]}>
            <Text style={[styles.bubbleText, styles.userBubbleText, styles.interimText]}>
              {interimText}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Voice status */}
      <View style={styles.statusArea}>
        <VoiceStatus state={voiceState} interimText={interimText || ''} />
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {isActive && (
          <Button
            title="끼어들기"
            onPress={() => sendBargeIn()}
            variant="secondary"
            size="lg"
            disabled={voiceState === 'listening'}
            icon={<Ionicons name="mic" size={16} color={voiceState === 'listening' ? '#999999' : '#ffffff'} />}
            style={{ flex: 1 }}
          />
        )}
        {isActive && (
          <Button
            title="대화 완료"
            onPress={handleFinish}
            variant="outline"
            size="lg"
            disabled={!canFinish}
            icon={<Ionicons name="checkmark-done" size={16} color={canFinish ? colors.primary : colors.textTertiary} />}
            style={{ flex: 1 }}
          />
        )}
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
  // Live2D Avatar
  avatarArea: {
    flex: 1,
  },
  // Messages (dev)
  messageArea: {
    maxHeight: 160,
    paddingHorizontal: spacing.md,
  },
  messageContent: {
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  interimBubble: {
    opacity: 0.6,
  },
  bubbleText: {
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
  },
  userBubbleText: {
    color: '#fff',
  },
  aiBubbleText: {
    color: colors.text,
  },
  interimText: {
    fontStyle: 'italic',
  },
  // Voice status
  statusArea: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  // Bottom controls
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
    backgroundColor: colors.background,
  },
});
