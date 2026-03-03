import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LearningCard as LearningCardType } from '../../types';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../constants/theme';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { usePronunciation } from '../../hooks/usePronunciation';
import { API_BASE_URL } from '../../services/api';
import CefrBadge from './CefrBadge';
import WordHighlightRow from './WordHighlightRow';
import PronunciationResultView from './PronunciationResult';

const typeConfig: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  word: { label: 'Word', color: '#3B82F6', icon: 'text' },
  phrase: { label: 'Phrase', color: '#10B981', icon: 'chatbubble-ellipses' },
  sentence: { label: 'Sentence', color: '#8B5CF6', icon: 'document-text' },
};

interface LearningCardProps {
  card: LearningCardType;
  savedResult?: import('../../types').PronunciationResult | null;
  onResultSaved?: (cardId: number, result: import('../../types').PronunciationResult) => void;
}

export default function LearningCard({ card, savedResult, onResultSaved }: LearningCardProps) {
  const config = typeConfig[card.card_type] ?? typeConfig.word;
  const contentAudio = useAudioPlayer();
  const exampleAudio = useAudioPlayer();
  const pronunciation = usePronunciation();
  const [openSection, setOpenSection] = useState<'content' | 'example' | null>('content');

  const resolveUrl = (url: string) =>
    url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const handleContentTts = () => {
    if (contentAudio.state === 'playing') {
      contentAudio.pause();
    } else if (contentAudio.state === 'paused') {
      contentAudio.resume();
    } else if (card.audio_url) {
      contentAudio.playFromUrl(resolveUrl(card.audio_url));
    } else {
      contentAudio.play(card.content_en);
    }
  };

  const handleExampleTts = () => {
    if (exampleAudio.state === 'playing') {
      exampleAudio.pause();
    } else if (exampleAudio.state === 'paused') {
      exampleAudio.resume();
    } else if (card.example_audio_url) {
      exampleAudio.playFromUrl(resolveUrl(card.example_audio_url));
    } else if (card.example_en) {
      exampleAudio.play(card.example_en);
    }
  };

  const toggleSection = (target: 'content' | 'example') => {
    if (openSection === target) {
      setOpenSection(null);
      pronunciation.reset();
    } else {
      setOpenSection(target);
      pronunciation.reset();
    }
  };

  const handleMicPress = () => {
    if (pronunciation.state === 'recording') {
      pronunciation.stopRecording();
    } else {
      const text = openSection === 'example' ? (card.example_en ?? '') : card.content_en;
      pronunciation.startRecording(text, card.id);
    }
  };

  const isRecording = pronunciation.state === 'recording';
  const isEvaluating = pronunciation.state === 'evaluating';
  const isDone = pronunciation.state === 'done';
  // 현재 세션 결과 또는 DB에서 가져온 이전 결과
  const displayResult = pronunciation.result ?? savedResult ?? null;
  const hasResult = isDone || (!isDone && !!savedResult);

  // 새 결과 저장 시 부모에 알림
  useEffect(() => {
    if (isDone && pronunciation.result && onResultSaved) {
      onResultSaved(card.id, pronunciation.result);
    }
  }, [isDone, pronunciation.result, card.id, onResultSaved]);

  return (
    <View style={styles.container}>
      {/* Type badge row */}
      <View style={styles.topRow}>
        <View style={[styles.typeBadge, { backgroundColor: config.color + '15' }]}>
          <Ionicons name={config.icon} size={14} color={config.color} />
          <Text style={[styles.typeLabel, { color: config.color }]}>{config.label}</Text>
        </View>
        <View style={styles.metaRow}>
          {card.part_of_speech && (
            <Text style={styles.partOfSpeech}>{card.part_of_speech}</Text>
          )}
          {card.cefr_level && <CefrBadge level={card.cefr_level} />}
        </View>
      </View>

      {/* English + sound icon */}
      <View style={styles.englishRow}>
        <Text style={[styles.english, { color: config.color }]}>{card.content_en}</Text>
        <TouchableOpacity onPress={handleContentTts} activeOpacity={0.7} disabled={contentAudio.state === 'loading'} hitSlop={8}>
          {contentAudio.state === 'loading' ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons
              name={contentAudio.state === 'playing' ? 'pause-circle' : 'volume-high'}
              size={22}
              color={colors.primary}
            />
          )}
        </TouchableOpacity>
      </View>

      {/* Korean */}
      <Text style={styles.korean}>{card.content_ko}</Text>

      {/* Example + sound icon */}
      {card.example_en && (
        <View style={styles.exampleContainer}>
          <Ionicons name="chatbox-outline" size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
          <Text style={styles.example}>{card.example_en}</Text>
          <TouchableOpacity onPress={handleExampleTts} activeOpacity={0.7} disabled={exampleAudio.state === 'loading'} hitSlop={8}>
            {exampleAudio.state === 'loading' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons
                name={exampleAudio.state === 'playing' ? 'pause-circle' : 'volume-high'}
                size={18}
                color={colors.textSecondary}
              />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, openSection === 'content' && { backgroundColor: config.color + '15' }]}
          onPress={() => toggleSection('content')}
          activeOpacity={0.7}
        >
          <Ionicons name={openSection === 'content' ? 'chevron-up' : 'mic'} size={20} color={config.color} />
          <Text style={[styles.actionText, { color: config.color }]}>
            {card.card_type === 'phrase' ? '구문 따라 말하기' : '단어 따라 말하기'}
          </Text>
        </TouchableOpacity>

        {card.example_en && (
          <TouchableOpacity
            style={[styles.actionButton, openSection === 'example' && { backgroundColor: colors.textSecondary + '15' }]}
            onPress={() => toggleSection('example')}
            activeOpacity={0.7}
          >
            <Ionicons name={openSection === 'example' ? 'chevron-up' : 'mic'} size={20} color={colors.textSecondary} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>예제 따라 말하기</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Pronunciation Section — Content */}
      {openSection === 'content' && (
        <View style={[styles.pronSection, { alignItems: 'center' }]}>
          {pronunciation.wordHighlights.length > 0 ? (
            <WordHighlightRow
              words={pronunciation.wordHighlights}
              showScores={isDone}
            />
          ) : (
            <Text style={[styles.pronTargetText, { color: config.color, textAlign: 'center' }]}>
              {card.content_en}
            </Text>
          )}
          <Text style={styles.pronTargetSub}>{card.content_ko}</Text>

          {isEvaluating ? (
            <ActivityIndicator size="large" color={config.color} style={{ marginTop: spacing.sm }} />
          ) : (
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonRecording]}
              onPress={handleMicPress}
              activeOpacity={0.7}
              disabled={isEvaluating}
            >
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={28}
                color={isRecording ? '#FFF' : config.color}
              />
            </TouchableOpacity>
          )}
          <Text style={styles.micHint}>
            {isRecording ? '듣고 있어요...' : isEvaluating ? '평가 중...' : '버튼을 눌러 말해보세요'}
          </Text>

          {hasResult && displayResult && (
            <PronunciationResultView
              result={displayResult}
              onRetry={() => pronunciation.reset()}
            />
          )}
        </View>
      )}

      {/* Pronunciation Section — Example */}
      {openSection === 'example' && card.example_en && (
        <View style={[styles.pronSection, { alignItems: 'flex-start' }]}>
          {pronunciation.wordHighlights.length > 0 ? (
            <WordHighlightRow
              words={pronunciation.wordHighlights}
              showScores={isDone}
            />
          ) : (
            <Text style={[styles.pronTargetText, { color: colors.text }]}>
              {card.example_en}
            </Text>
          )}
          {card.example_ko && (
            <Text style={styles.pronTargetSub}>{card.example_ko}</Text>
          )}

          {isEvaluating ? (
            <ActivityIndicator size="large" color={colors.textSecondary} style={{ marginTop: spacing.sm, alignSelf: 'center' }} />
          ) : (
            <TouchableOpacity
              style={[styles.micButton, isRecording && styles.micButtonRecording, { alignSelf: 'center' }]}
              onPress={handleMicPress}
              activeOpacity={0.7}
              disabled={isEvaluating}
            >
              <Ionicons
                name={isRecording ? 'stop' : 'mic'}
                size={28}
                color={isRecording ? '#FFF' : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          <Text style={[styles.micHint, { alignSelf: 'center' }]}>
            {isRecording ? '듣고 있어요...' : isEvaluating ? '평가 중...' : '버튼을 눌러 말해보세요'}
          </Text>

          {hasResult && displayResult && (
            <PronunciationResultView
              result={displayResult}
              onRetry={() => pronunciation.reset()}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  typeLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  partOfSpeech: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  englishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  english: {
    flex: 1,
    fontSize: fontSize.xl,
    fontWeight: '700',
    lineHeight: fontSize.xl * 1.3,
  },
  korean: {
    fontSize: fontSize.lg,
    color: colors.text,
    lineHeight: fontSize.lg * 1.4,
  },
  exampleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  example: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  actionText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.primary,
  },
  pronSection: {
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  pronTargetText: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    lineHeight: fontSize.lg * 1.4,
  },
  pronTargetSub: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: -spacing.sm,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: spacing.sm,
  },
  micButtonRecording: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  micHint: {
    fontSize: fontSize.xs,
    color: colors.textTertiary,
  },
});
