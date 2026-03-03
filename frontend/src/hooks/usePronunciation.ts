import { useState, useCallback, useRef, useEffect } from 'react';
import { PronunciationResult, WordHighlight } from '../types';
import { getSpeechToken, savePronunciationResult } from '../services/api';
import {
  startAssessment,
  stopAssessment,
  addRecognizingListener,
  addRecognizedListener,
  addErrorListener,
} from '../../modules/expo-azure-pronunciation/src';
import type { Subscription } from 'expo-modules-core';

export type PronunciationState = 'idle' | 'recording' | 'evaluating' | 'done';

interface UsePronunciationReturn {
  state: PronunciationState;
  result: PronunciationResult | null;
  wordHighlights: WordHighlight[];
  currentWordIndex: number;
  startRecording: (text: string, cardId: number) => void;
  stopRecording: () => void;
  reset: () => void;
}

interface CachedToken {
  token: string;
  region: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

async function getToken(): Promise<{ token: string; region: string }> {
  const now = Date.now();
  // Refresh if no cache or within 2 minutes of expiry
  if (!cachedToken || cachedToken.expiresAt - now < 2 * 60 * 1000) {
    const resp = await getSpeechToken();
    cachedToken = {
      token: resp.token,
      region: resp.region,
      expiresAt: new Date(resp.expiresAt).getTime(),
    };
  }
  return { token: cachedToken.token, region: cachedToken.region };
}

/** Pre-fetch and cache the speech token. Call at learning start. */
export async function prefetchSpeechToken(): Promise<void> {
  await getToken();
}

export function usePronunciation(): UsePronunciationReturn {
  const [state, setState] = useState<PronunciationState>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [wordHighlights, setWordHighlights] = useState<WordHighlight[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const textRef = useRef('');
  const cardIdRef = useRef(0);
  const subscriptionsRef = useRef<Subscription[]>([]);

  const cleanup = useCallback(() => {
    subscriptionsRef.current.forEach((sub) => sub.remove());
    subscriptionsRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startRecording = useCallback(
    async (text: string, cardId: number) => {
      textRef.current = text;
      cardIdRef.current = cardId;
      setResult(null);
      setCurrentWordIndex(-1);

      const words = text.trim().split(/\s+/);
      setWordHighlights(
        words.map((w) => ({ word: w, status: 'pending' as const })),
      );
      setState('recording');

      // Clean up any previous subscriptions
      cleanup();

      try {
        console.log('[Pronunciation] 1. Requesting speech token...');
        const { token, region } = await getToken();
        console.log('[Pronunciation] 2. Token received:', {
          tokenLength: token.length,
          region,
          expiresAt: cachedToken?.expiresAt ? new Date(cachedToken.expiresAt).toISOString() : '?',
        });

        const subs: Subscription[] = [];

        subs.push(
          addRecognizingListener((event) => {
            console.log('[Pronunciation] Event:recognizing (full)', JSON.stringify(event, null, 2));
            const idx = event.wordIndex;
            setCurrentWordIndex(idx);
            setWordHighlights((prev) =>
              prev.map((wh, i) => {
                if (i < idx) return { ...wh, status: 'done' as const };
                if (i === idx) return { ...wh, status: 'speaking' as const };
                return { ...wh, status: 'pending' as const };
              }),
            );
          }),
        );

        subs.push(
          addRecognizedListener(async (event) => {
            console.log('[Pronunciation] Event:recognized (full)', JSON.stringify(event, null, 2));
            setState('evaluating');

            const wordScores = event.words.map((w) => ({
              word: w.word,
              score: w.score,
              errorType: w.errorType,
            }));

            // Update word highlights with final scores
            setWordHighlights((prev) =>
              prev.map((wh, i) => {
                const matched = wordScores[i];
                return {
                  word: wh.word,
                  status: 'done' as const,
                  score: matched?.score,
                  errorType: matched?.errorType,
                };
              }),
            );
            setCurrentWordIndex(-1);

            const pronResult: PronunciationResult = {
              overallScore: event.pronScore,
              accuracyScore: event.accuracyScore,
              fluencyScore: event.fluencyScore,
              completenessScore: event.completenessScore,
              feedback: '',
              wordScores,
            };

            // Save to backend
            try {
              const saved = await savePronunciationResult({
                card_id: cardIdRef.current,
                reference_text: textRef.current,
                overall_score: event.pronScore,
                accuracy_score: event.accuracyScore,
                fluency_score: event.fluencyScore,
                completeness_score: event.completenessScore,
                word_scores: wordScores.map((ws) => ({
                  word: ws.word,
                  score: ws.score,
                  error_type: ws.errorType,
                })),
              });
              pronResult.feedback = saved.feedback;
            } catch (saveErr) {
              console.error('[Pronunciation] Backend save failed:', saveErr);
            }

            setResult(pronResult);
            setState('done');
            cleanup();
          }),
        );

        subs.push(
          addErrorListener((event) => {
            console.warn('[Pronunciation] Error:', event.code, event.message);
            setState('idle');
            cleanup();
          }),
        );

        subscriptionsRef.current = subs;

        console.log('[Pronunciation] 3. Starting assessment...', {
          referenceText: text,
          language: 'en-US',
        });
        startAssessment({
          authToken: token,
          region,
          referenceText: text,
          language: 'en-US',
        });
        console.log('[Pronunciation] 4. startAssessment called — waiting for SDK events');
      } catch (err) {
        console.error('[Pronunciation] Failed:', err);
        setState('idle');
      }
    },
    [cleanup],
  );

  const stopRecording = useCallback(() => {
    stopAssessment();
    // State transition will happen via onRecognized or onError events
  }, []);

  const reset = useCallback(() => {
    cleanup();
    stopAssessment();
    setState('idle');
    setResult(null);
    setWordHighlights([]);
    setCurrentWordIndex(-1);
    textRef.current = '';
    cardIdRef.current = 0;
  }, [cleanup]);

  return {
    state,
    result,
    wordHighlights,
    currentWordIndex,
    startRecording,
    stopRecording,
    reset,
  };
}
