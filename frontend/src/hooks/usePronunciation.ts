import { useState, useCallback, useRef } from 'react';
import { PronunciationResult } from '../types';
import { evaluatePronunciation } from '../services/api';

type PronunciationState = 'idle' | 'recording' | 'evaluating' | 'done';

interface UsePronunciationReturn {
  state: PronunciationState;
  result: PronunciationResult | null;
  startRecording: (text: string) => void;
  stopRecording: () => void;
  reset: () => void;
}

export function usePronunciation(): UsePronunciationReturn {
  const [state, setState] = useState<PronunciationState>('idle');
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const textRef = useRef('');

  const startRecording = useCallback((text: string) => {
    textRef.current = text;
    setResult(null);
    setState('recording');
  }, []);

  const stopRecording = useCallback(async () => {
    setState('evaluating');

    try {
      // Mock: send text for evaluation (real impl would send audio file)
      const evalResult = await evaluatePronunciation(textRef.current);
      setResult(evalResult);
      setState('done');
    } catch {
      setState('idle');
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    textRef.current = '';
  }, []);

  return { state, result, startRecording, stopRecording, reset };
}
