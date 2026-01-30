/**
 * Client-side API helpers for the voice agent (browser only).
 */

const API_BASE = '/api/v1';
const API_KEY_STORAGE = 'voice_agent_api_key';

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setStoredApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(API_KEY_STORAGE, apiKey);
}

export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(API_KEY_STORAGE);
}

function headers(apiKey: string, json = true): HeadersInit {
  const h: HeadersInit = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (json) (h as Record<string, string>)['Content-Type'] = 'application/json';
  return h;
}

export async function register(email: string): Promise<{ userId: string; apiKey: string }> {
  const res = await fetch(`${API_BASE}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Register failed: ${res.status}`);
  }
  return res.json();
}

export async function login(apiKey: string): Promise<{ userId: string; email: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Login failed: ${res.status}`);
  }
  return res.json();
}

export async function createSession(apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: headers(apiKey),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data.message as string) || `Create session failed (${res.status}). Is the server running?`
      );
    }
    return data.sessionId as string;
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error(
        'Connection error. Is the server running? Start it with: npm run dev'
      );
    }
    throw err;
  }
}

export interface ChatMessage {
  role: string;
  content: string;
}

export async function getMessages(
  apiKey: string,
  sessionId: string,
  limit = 50
): Promise<ChatMessage[]> {
  const res = await fetch(
    `${API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`,
    { headers: headers(apiKey) }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Get messages failed: ${res.status}`);
  }
  const data = await res.json();
  return data.messages ?? [];
}

const VOICE_REQUEST_TIMEOUT_MS = 120_000; // 2 min for STT + LLM + TTS

export async function sendVoice(
  apiKey: string,
  audioBlob: Blob,
  sessionId: string | null
): Promise<{ audio: Blob; transcript: string; sessionId: string }> {
  const form = new FormData();
  form.append('audio', audioBlob, 'audio.webm');
  if (sessionId) form.append('sessionId', sessionId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VOICE_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}/voice/conversation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const newSessionId = res.headers.get('X-Session-Id') || sessionId || '';
    const transcript = res.headers.get('X-Transcript') || '';

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data.message as string) || `Voice request failed: ${res.status}`);
    }

    const audio = await res.blob();
    return { audio, transcript, sessionId: newSessionId };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        throw new Error(
          'Request timed out. The server may be slow (STT + LLM + TTS). Try again or use a shorter recording.'
        );
      }
    }
    throw err;
  }
}
