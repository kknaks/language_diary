import { requireNativeModule, EventEmitter, type Subscription } from 'expo-modules-core';
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
const emitter = new EventEmitter(ExpoAzurePronunciation);

export function startAssessment(config: AssessmentConfig): void {
  ExpoAzurePronunciation.startAssessment(config);
}

export function stopAssessment(): void {
  ExpoAzurePronunciation.stopAssessment();
}

export function addRecognizingListener(
  callback: (event: RecognizingEvent) => void,
): Subscription {
  return emitter.addListener('onRecognizing', callback);
}

export function addRecognizedListener(
  callback: (event: RecognizedEvent) => void,
): Subscription {
  return emitter.addListener('onRecognized', callback);
}

export function addErrorListener(
  callback: (event: ErrorEvent) => void,
): Subscription {
  return emitter.addListener('onError', callback);
}
