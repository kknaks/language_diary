import { useState, useCallback, useRef, useEffect } from 'react';
import { PronunciationResult, WordHighlight } from '../types';
import { getSpeechToken, savePronunciationResult } from '../services/api';
import { debugLog } from '../components/common/DebugBanner';
import {
  startAssessment,
  stopAssessment,
  addRecognizingListener,
  addRecognizedListener,
  addErrorListener,
} from '../../modules/expo-azure-pronunciation/src';
import type { EventSubscription as Subscription } from 'expo-modules-core';

export type PronunciationState = 'idle' | 'recording' | 'evaluating' | 'done' | 'error';

interface UsePronunciationReturn {
  state: PronunciationState;
  result: PronunciationResult | null;
  errorMessage: string | null;
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

/** Map simple language code to Azure Speech locale */
const LANG_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  ja: 'ja-JP',
  zh: 'zh-CN',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  ko: 'ko-KR',
  pt: 'pt-BR',
  it: 'it-IT',
  vi: 'vi-VN',
  th: 'th-TH',
};

export function usePronunciation(langCode?: string): UsePronunciationReturn {
  const language = LANG_TO_LOCALE[langCode ?? 'en'] ?? 'en-US';
  const [state, setState] = useState<PronunciationState>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wordHighlights, setWordHighlights] = useState<WordHighlight[]>([]);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const textRef = useRef('');
  const cardIdRef = useRef(0);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    subscriptionsRef.current.forEach((sub) => sub.remove());
    subscriptionsRef.current = [];
  }, []);

  // On unmount: remove JS listeners AND stop the native recognizer
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
      stopAssessment();
    };
  }, [cleanup]);

  const startRecording = useCallback(
    async (text: string, cardId: number) => {
      textRef.current = text;
      cardIdRef.current = cardId;
      setResult(null);
      setErrorMessage(null);
      setCurrentWordIndex(-1);

      const words = text.trim().split(/\s+/);
      setWordHighlights(
        words.map((w) => ({ word: w, status: 'pending' as const })),
      );
      setState('recording');

      // Clean up any previous subscriptions
      cleanup();

      try {
        debugLog('info', `[Pron] 시작: "${text}"`);
        console.log('[Pronunciation] 1. Requesting speech token...');
        const { token, region } = await getToken();
        debugLog('info', `[Pron] 토큰 발급 region=${region}`);
        console.log('[Pronunciation] 2. Token received:', {
          tokenLength: token.length,
          region,
          expiresAt: cachedToken?.expiresAt ? new Date(cachedToken.expiresAt).toISOString() : '?',
        });

        const subs: Subscription[] = [];

        subs.push(
          addRecognizingListener((event) => {
            if (!mountedRef.current) return;
            debugLog('info', `[Pron] recognizing: "${event.text}" wordIdx=${event.wordIndex}`);
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
          addRecognizedListener((event) => {
            if (!mountedRef.current) return;
            debugLog('info', `[Pron] recognized: "${event.text}" pron=${event.pronScore} acc=${event.accuracyScore} flu=${event.fluencyScore} words=${event.words.length}개`);
            console.log('[Pronunciation] Event:recognized (full)', JSON.stringify(event, null, 2));

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

            // Show result immediately, save to backend in background
            setResult(pronResult);
            setState('done');
            cleanup();

            savePronunciationResult({
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
            }).then((saved) => {
              if (!mountedRef.current) return;
              setResult((prev) => prev ? { ...prev, feedback: saved.feedback } : prev);
            }).catch((saveErr) => {
              console.error('[Pronunciation] Backend save failed:', saveErr);
            });
          }),
        );

        subs.push(
          addErrorListener((event) => {
            if (!mountedRef.current) return;
            debugLog('error', `[Pron] 에러: ${event.code} — ${event.message}`);
            console.warn('[Pronunciation] Error:', event.code, event.message);
            const msg = event.message || '음성 인식에 실패했습니다.';
            setErrorMessage(`${msg} (${event.code})`);
            setState('error');
            cleanup();
          }),
        );

        subscriptionsRef.current = subs;

        debugLog('info', `[Pron] startAssessment lang=${language}`);
        console.log('[Pronunciation] 3. Starting assessment...', {
          referenceText: text,
          language,
        });
        startAssessment({
          authToken: token,
          region,
          referenceText: text,
          language,
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
    setErrorMessage(null);
    setWordHighlights([]);
    setCurrentWordIndex(-1);
    textRef.current = '';
    cardIdRef.current = 0;
  }, [cleanup]);

  return {
    state,
    result,
    errorMessage,
    wordHighlights,
    currentWordIndex,
    startRecording,
    stopRecording,
    reset,
  };
}
