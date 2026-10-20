/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'ta' | 'en';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface DocumentItem {
  id: string;
  name: string;
  name_en?: string;
  pages?: number;
  chunks: number;
  size?: string;
  category?: string;
  category_en?: string;
  uploadedAt?: string;
}

export interface SourceCitation {
  n: number;
  doc: string;
  page: number;
  text: string;
  text_en?: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  timestamp: number;
  latency_ms?: number;
}

export interface SystemStats {
  documents: number;
  chunks: number;
  questions_answered: number;
  avg_latency_ms: number;
}

export interface EvalItem {
  q: string;
  q_en?: string;
  answer: string;
  answer_en?: string;
  correct: boolean;
  latency_ms: number;
  sources: SourceCitation[];
  category?: string;
  category_en?: string;
}

export interface EvalResults {
  total: number;
  correct: number;
  accuracy: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  items: EvalItem[];
}

export interface VoiceToken {
  url: string;
  token: string;
  room: string;
}

export interface HealthStatus {
  online: boolean;
  status: string;
  models: string[];
}

export interface SystemConfig {
  voice_enabled: boolean;
  languages: ('ta' | 'en')[];
  providers: string[];
  offline: boolean;
  /** True when the backend is protected by APP_PASSWORD. */
  auth_required: boolean;
}

export interface AccessibilitySettings {
  fontSize: number; // 100 to 200 percentage
  highContrast: boolean;
  reduceMotion: boolean;
  readAloud: boolean;
  theme: 'dark' | 'light';
  audioFeedback: boolean;
  /** UI language, persisted with the other accessibility preferences. */
  language: Language;
}

export type ActiveScreen = 'landing' | 'talk' | 'chat' | 'library' | 'eval' | 'settings';
