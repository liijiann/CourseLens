import { SessionMeta, SessionResponse, StreamEvent, UploadResponse } from '@/lib/types';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? 'http://127.0.0.1:8000';

export function getStoredApiKey(model: string): string {
  const provider = model.startsWith('qwen') ? 'dashscope' : model;
  return localStorage.getItem(`${provider}_api_key`) ?? '';
}

export function setStoredApiKey(model: 'dashscope', key: string): void {
  localStorage.setItem(`${model}_api_key`, key);
}

function apiKeyHeaders(model: string): Record<string, string> {
  const key = getStoredApiKey(model);
  return key ? { 'X-Api-Key': key } : {};
}

async function parseSSE(
  response: Response,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error('流式响应体为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const emitRawEvent = (rawEvent: string) => {
    const lines = rawEvent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'));
    if (lines.length === 0) {
      return;
    }

    const payload = lines.map((line) => line.slice(5).trim()).join('\n');
    if (!payload) {
      return;
    }

    try {
      const event = JSON.parse(payload) as StreamEvent;
      onEvent(event);
    } catch {
      // ignore malformed SSE payload
    }
  };

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, '\n');
    const events = normalized.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      emitRawEvent(rawEvent);
    }
  }

  buffer += decoder.decode();
  const tail = buffer.replace(/\r\n/g, '\n').trim();
  if (tail) {
    emitRawEvent(tail);
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  let detail = `${response.status} ${response.statusText}`;
  try {
    const payload = await response.json();
    if (payload?.detail) {
      detail = String(payload.detail);
    }
  } catch {
    // noop
  }
  throw new Error(detail);
}

export async function uploadPdf(
  file: File,
  model: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('model', model);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: form,
  });
  await assertOk(response);
  return (await response.json()) as UploadResponse;
}

export async function fetchSessions(): Promise<SessionMeta[]> {
  const response = await fetch(`${API_BASE}/api/sessions`, { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as SessionMeta[];
}

export async function fetchSession(sessionId: string): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}`, {
    cache: 'no-store',
  });
  await assertOk(response);
  return (await response.json()) as SessionResponse;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}`, {
    method: 'DELETE',
  });
  await assertOk(response);
}

export async function streamExplanation(
  sessionId: string,
  pageNumber: number,
  model: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/explain/${sessionId}/${pageNumber}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...apiKeyHeaders(model),
      },
      signal,
      cache: 'no-store',
    },
  );
  await assertOk(response);
  await parseSSE(response, onEvent, signal);
}

export async function streamChat(
  sessionId: string,
  pageNumber: number,
  model: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/chat/${sessionId}/${pageNumber}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...apiKeyHeaders(model),
    },
    body: JSON.stringify({ message }),
    signal,
  });
  await assertOk(response);
  await parseSSE(response, onEvent, signal);
}

export function getPdfUrl(sessionId: string): string {
  return `${API_BASE}/api/file/${sessionId}/original`;
}
