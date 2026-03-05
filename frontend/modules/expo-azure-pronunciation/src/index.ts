import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type {
  AssessmentConfig,
  RecognizingEvent,
  RecognizedEvent,
  ErrorEvent,
} from './ExpoAzurePronunciation.types';

export type {
  AssessmentConfig,
  RecognizingEvent,
  RecognizedEvent,
  ErrorEvent,
  WordResult,
} from './ExpoAzurePronunciation.types';

const ExpoAzurePronunciation = requireNativeModule('ExpoAzurePronunciation');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitter = new EventEmitter(ExpoAzurePronunciation) as any;

export function startAssessment(config: AssessmentConfig): void {
  ExpoAzurePronunciation.startAssessment(config);
}

export function stopAssessment(): void {
  ExpoAzurePronunciation.stopAssessment();
}

export function addRecognizingListener(
  callback: (event: RecognizingEvent) => void,
) {
  return emitter.addListener('onRecognizing', callback);
}

export function addRecognizedListener(
  callback: (event: RecognizedEvent) => void,
) {
  return emitter.addListener('onRecognized', callback);
}

export function addErrorListener(
  callback: (event: ErrorEvent) => void,
) {
  return emitter.addListener('onError', callback);
}

export function addDebugListener(
  callback: (event: { message: string }) => void,
) {
  return emitter.addListener('onDebug', callback);
}
