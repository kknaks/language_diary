import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LearningCard as LearningCardType } from '../../types';
import { colors, fontSize, spacing, borderRadius, shadows } from '../../constants/theme';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { usePronunciation } from '../../hooks/usePronunciation';
import { API_BASE_URL } from '../../services/api';
import CefrBadge from './CefrBadge';
import PronunciationResultView from './PronunciationResult';

const typeConfig: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  word: { label: 'Word', color: '#3B82F6', icon: 'text' },
  phrase: { label: 'Phrase', color: '#10B981', icon: 'chatbubble-ellipses' },
  sentence: { label: 'Sentence', color: '#8B5CF6', icon: 'document-text' },
};

interface LearningCardProps {
  card: LearningCardType;
}

export default function LearningCard({ card }: LearningCardProps) {
  const config = typeConfig[card.card_type] ?? typeConfig.word;
  const contentAudio = useAudioPlayer();
  const exampleAudio = useAudioPlayer();
  const pronunciation = usePronunciation();
  const [showPronunciation, setShowPronunciation] = useState(false);

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

  const handlePronunciation = () => {
    if (pronunciation.state === 'idle' || pronunciation.state === 'done') {
      pronunciation.reset();
      setShowPronunciation(true);
      pronunciation.startRecording(card.content_en);
    } else if (pronunciation.state === 'recording') {
      pronunciation.stopRecording();
    }
  };

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
        {/* Pronunciation Button */}
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handlePronunciation}
          activeOpacity={0.7}
          disabled={pronunciation.state === 'evaluating'}
        >
          {pronunciation.state === 'evaluating' ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <Ionicons
              name={pronunciation.state === 'recording' ? 'stop-circle' : 'mic'}
              size={22}
              color={pronunciation.state === 'recording' ? colors.error : colors.secondary}
            />
          )}
          <Text style={[styles.actionText, { color: pronunciation.state === 'recording' ? colors.error : colors.secondary }]}>
            {pronunciation.state === 'recording'
              ? '녹음 중지'
              : pronunciation.state === 'evaluating'
                ? '평가 중...'
                : '따라 말하기'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Pronunciation result */}
      {showPronunciation && pronunciation.state === 'done' && pronunciation.result && (
        <PronunciationResultView result={pronunciation.result} />
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
});
