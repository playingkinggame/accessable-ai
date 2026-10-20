/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DocumentItem,
  EvalItem,
  EvalResults,
  HealthStatus,
  SourceCitation,
  SystemConfig,
  SystemStats,
  VoiceToken,
} from './types';

/** Backend base URL. Defaults to the local FastAPI server. */
export const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000'
).replace(/\/+$/, '');

const TOKEN_KEY = 'accessable_auth_token';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Auth token (the only thing besides a11y prefs kept in localStorage) */
/* ------------------------------------------------------------------ */

export const getAuthToken = (): string => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (err) {
    console.warn('Unable to read the auth token from localStorage', err);
    return '';
  }
};

export const setAuthToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    console.warn('Unable to persist the auth token in localStorage', err);
  }
};

export const clearAuthToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch (err) {
    console.warn('Unable to clear the auth token from localStorage', err);
  }
};

/** Subscribers are notified whenever the backend rejects our token. */
type UnauthorizedHandler = () => void;
const unauthorizedHandlers = new Set<UnauthorizedHandler>();

export const onUnauthorized = (handler: UnauthorizedHandler): (() => void) => {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
};

function emitUnauthorized(): void {
  clearAuthToken();
  unauthorizedHandlers.forEach((handler) => handler());
}

/* ------------------------------------------------------------------ */
/* Shared fetch helper                                                 */
/* ------------------------------------------------------------------ */

async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail;
      if (typeof detail === 'string' && detail.trim()) return detail;
    }
  } catch (err) {
    // The error body was not JSON (empty or plain text); fall through to the fallback.
    console.warn('Backend returned a non-JSON error body', err);
  }
  return fallback;
}

/**
 * Every authenticated request goes through here so the Bearer token and the
 * 401 handling live in exactly one place.
 */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401) {
    emitUnauthorized();
    throw new ApiError('Not signed in', 401);
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* Normalization layer: backend shapes -> UI shapes                    */
/* ------------------------------------------------------------------ */

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const asOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const asOptionalString = (value: unknown): string | undefined => {
  const text = asString(value).trim();
  return text ? text : undefined;
};

/** Raw backend document: {id, name, chunks, pages?, size?, uploaded_at?}. */
function normalizeDocument(raw: unknown): DocumentItem {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    id: asString(source.id),
    name: asString(source.name) || asString(source.doc),
    name_en: asOptionalString(source.name_en),
    pages: asOptionalNumber(source.pages),
    chunks: asNumber(source.chunks),
    size: asOptionalString(source.size),
    category: asOptionalString(source.category),
    category_en: asOptionalString(source.category_en),
    uploadedAt: asOptionalString(source.uploadedAt) ?? asOptionalString(source.uploaded_at),
  };
}

function normalizeDocuments(raw: unknown): DocumentItem[] {
  const list =
    Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as { documents?: unknown }).documents)
        ? ((raw as { documents: unknown[] }).documents)
        : [];
  return list.map(normalizeDocument).filter((doc) => doc.id || doc.name);
}

function normalizeSource(raw: unknown): SourceCitation {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    n: asNumber(source.n),
    doc: asString(source.doc),
    page: asNumber(source.page),
    text: asString(source.text),
    text_en: asOptionalString(source.text_en),
    score: asNumber(source.score),
  };
}

export function normalizeSources(raw: unknown): SourceCitation[] {
  return Array.isArray(raw) ? raw.map(normalizeSource) : [];
}

/** Backend accuracy is a 0..1 fraction; the UI renders percentages. */
function toPercent(value: unknown): number {
  const fraction = asNumber(value);
  return Math.round(fraction * 1000) / 10;
}

function normalizeEvalItem(raw: unknown): EvalItem {
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    q: asString(item.q),
    q_en: asOptionalString(item.q_en),
    answer: asString(item.answer),
    answer_en: asOptionalString(item.answer_en),
    correct: item.correct === true,
    latency_ms: asNumber(item.latency_ms),
    sources: normalizeSources(item.sources),
    category: asOptionalString(item.category),
    category_en: asOptionalString(item.category_en),
  };
}

function normalizeEvalResults(raw: unknown): EvalResults {
  const data = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items.map(normalizeEvalItem) : [];
  return {
    total: asNumber(data.total, items.length),
    correct: asNumber(data.correct, items.filter((i) => i.correct).length),
    accuracy: toPercent(data.accuracy),
    avg_latency_ms: asNumber(data.avg_latency_ms),
    p95_latency_ms: asNumber(data.p95_latency_ms),
    items,
  };
}

function normalizeStats(raw: unknown): SystemStats {
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    documents: asNumber(data.documents),
    chunks: asNumber(data.chunks),
    questions_answered: asNumber(data.questions_answered),
    avg_latency_ms: asNumber(data.avg_latency_ms),
  };
}

/* ------------------------------------------------------------------ */
/* Chat streaming                                                      */
/* ------------------------------------------------------------------ */

export interface ChatStreamHandlers {
  onToken: (token: string) => void;
  onSources: (sources: SourceCitation[]) => void;
  onDone: (latencyMs: number, model?: string) => void;
}

export interface ChatRequest {
  message: string;
  docIds: string[];
  language: 'ta' | 'en';
  chatId: string;
}

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export const ApiClient = {
  async getConfig(): Promise<SystemConfig> {
    const res = await fetch(`${API_BASE_URL}/api/config`);
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Config request failed'), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    return {
      voice_enabled: data.voice_enabled === true,
      languages: Array.isArray(data.languages) ? (data.languages as ('ta' | 'en')[]) : [],
      providers: Array.isArray(data.providers) ? (data.providers as string[]) : [],
      offline: data.offline === true,
      auth_required: data.auth_required === true,
    };
  },

  /** Live health probe used by Settings; unauthenticated on the backend. */
  async getHealth(): Promise<HealthStatus> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/api/health`);
    } catch (err) {
      throw new ApiError(
        err instanceof Error ? `Backend unreachable: ${err.message}` : 'Backend unreachable',
        0
      );
    }
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Health check failed'), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    return {
      online: data.status === 'ok',
      status: asString(data.status) || 'unknown',
      models: Array.isArray(data.models) ? (data.models as string[]) : [],
    };
  },

  async login(password: string): Promise<{ token: string }> {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      throw new ApiError(await errorDetail(res, 'Sign in failed'), res.status);
    }
    const data = (await res.json()) as { token?: unknown };
    const token = asString(data.token);
    if (!token) throw new ApiError('Backend did not return a token', 500);
    setAuthToken(token);
    return { token };
  },

  async getDocuments(): Promise<DocumentItem[]> {
    const res = await authFetch('/api/documents');
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Failed to load documents'), res.status);
    return normalizeDocuments(await res.json());
  },

  async uploadDocument(file: File): Promise<DocumentItem[]> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await authFetch('/api/documents', { method: 'POST', body: formData });
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Upload failed'), res.status);
    return normalizeDocuments(await res.json());
  },

  async deleteDocument(id: string): Promise<{ success: boolean }> {
    const res = await authFetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Delete failed'), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    return { success: asString(data.deleted) === id || data.deleted === undefined };
  },

  async getStats(): Promise<SystemStats> {
    const res = await authFetch('/api/stats');
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Failed to load stats'), res.status);
    return normalizeStats(await res.json());
  },

  /** POST /api/chat, parsed as Server-Sent Events. */
  async streamChat(
    { message, docIds, language, chatId }: ChatRequest,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await authFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, doc_ids: docIds, language, chat_id: chatId }),
      signal,
    });

    if (!res.ok) throw new ApiError(await errorDetail(res, 'Chat request failed'), res.status);
    if (!res.body) throw new ApiError('Chat response had no body', res.status);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const handleLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return false;
      const payloadText = trimmed.replace(/^data:\s*/, '');
      if (!payloadText) return false;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payloadText) as Record<string, unknown>;
      } catch (err) {
        console.warn('Skipping malformed SSE line', payloadText, err);
        return false;
      }
      switch (parsed.type) {
        case 'token':
          // The backend may send the whole answer in a single token event.
          if (typeof parsed.text === 'string' && parsed.text) handlers.onToken(parsed.text);
          return false;
        case 'sources':
          handlers.onSources(normalizeSources(parsed.sources));
          return false;
        case 'done':
          handlers.onDone(asNumber(parsed.latency_ms), asOptionalString(parsed.model));
          return true;
        case 'error':
          throw new ApiError(
            asOptionalString(parsed.message) || 'The assistant failed to answer',
            500
          );
        default:
          console.warn('Unknown chat event type', parsed.type);
          return false;
      }
    };

    let finished = false;
    try {
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          finished = handleLine(line) || finished;
        }
      }
      if (!finished && buffer.trim()) handleLine(buffer);
    } finally {
      if (finished) {
        // We got the `done` event; stop the HTTP body from streaming further.
        await reader.cancel().catch((err: unknown) => console.warn('Chat stream cancel failed', err));
      }
      reader.releaseLock();
    }
  },

  async getVoiceToken(docIds: string[], language: 'ta' | 'en'): Promise<VoiceToken> {
    const res = await authFetch('/api/voice/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doc_ids: docIds, language }),
    });
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Voice token request failed'), res.status);
    const data = (await res.json()) as Record<string, unknown>;
    const url = asString(data.url);
    const token = asString(data.token);
    const room = asString(data.room);
    if (!url || !token) throw new ApiError('Backend returned an incomplete voice token', 500);
    return { url, token, room };
  },

  async runEval(): Promise<EvalResults> {
    const res = await authFetch('/api/eval/run', { method: 'POST' });
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Evaluation failed'), res.status);
    return normalizeEvalResults(await res.json());
  },

  /** Reads the last stored eval run; returns an empty result set when none exists. */
  async getEvalResults(): Promise<EvalResults> {
    const res = await authFetch('/api/eval/results');
    if (!res.ok) throw new ApiError(await errorDetail(res, 'Failed to load eval results'), res.status);
    return normalizeEvalResults(await res.json());
  },
};
