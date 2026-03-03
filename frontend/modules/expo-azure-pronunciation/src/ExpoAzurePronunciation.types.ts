export interface AssessmentConfig {
  authToken: string;
  region: string;
  referenceText: string;
  language?: string; // default: "en-US"
}

export interface WordResult {
  word: string;
  score: number;
  errorType?: string;
}

export interface RecognizingEvent {
  text: string;
  wordIndex: number;
}

export interface RecognizedEvent {
  text: string;
  pronScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: WordResult[];
}

export interface ErrorEvent {
  code: string;
  message: string;
}
