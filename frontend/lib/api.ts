import {
  AdminRechargeOrder,
  AdminInviteCode,
  AdminUserSession,
  AdminUserSessionsResponse,
  AdminUser,
  AdminAnnouncement,
  Announcement,
  AuthTokenResponse,
  AuthUser,
  RechargeOrder,
  RechargePackage,
  SearchResponse,
  SessionMeta,
  SessionResponse,
  StorageStatus,
  StreamEvent,
  UploadResponse,
} from '@/lib/types';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? 'http://127.0.0.1:8000';

const TOKEN_STORAGE_KEY = 'courselens:token';
export const INVALID_API_KEY_EVENT = 'courselens:invalid-api-key';
const INVALID_API_KEY_HINT_KEY = 'courselens:invalid_api_key_hint_shown';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

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

function notifyInvalidApiKeyOnce(): void {
  if (typeof window === 'undefined') return;
  if (window.sessionStorage.getItem(INVALID_API_KEY_HINT_KEY) === '1') return;
  window.sessionStorage.setItem(INVALID_API_KEY_HINT_KEY, '1');
  window.dispatchEvent(new CustomEvent(INVALID_API_KEY_EVENT));
}

function redirectToLoginIfNeeded(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

function mergeHeaders(baseHeaders?: HeadersInit, extraHeaders?: Record<string, string>): Headers {
  const headers = new Headers(baseHeaders ?? undefined);
  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      headers.set(key, value);
    }
  }
  return headers;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const headers = mergeHeaders(init?.headers, token ? { Authorization: `Bearer ${token}` } : undefined);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearStoredToken();
    redirectToLoginIfNeeded();
  }

  return response;
}

async function parseSSE(
  response: Response,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    throw new Error('SSE response body is empty');
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
      const lowerDetail = detail.toLowerCase();
      if (
        detail.includes('无效或已失效')
        || lowerDetail.includes('api key')
        || lowerDetail.includes('api-key')
        || lowerDetail.includes('apikey')
      ) {
        notifyInvalidApiKeyOnce();
      }
    }
  } catch {
    // noop
  }
  throw new Error(detail);
}

export async function login(email: string, password: string): Promise<AuthTokenResponse> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  await assertOk(response);
  return (await response.json()) as AuthTokenResponse;
}

export async function register(email: string, password: string, inviteCode: string): Promise<AuthTokenResponse> {
  const response = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, invite_code: inviteCode }),
  });
  await assertOk(response);
  return (await response.json()) as AuthTokenResponse;
}

export async function fetchMe(): Promise<AuthUser> {
  const response = await apiFetch('/api/auth/me', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as AuthUser;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const response = await apiFetch('/api/admin/users', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as AdminUser[];
}

export async function banUser(userId: number): Promise<void> {
  const response = await apiFetch(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
  });
  await assertOk(response);
}

export async function unbanUser(userId: number): Promise<void> {
  const response = await apiFetch(`/api/admin/users/${userId}/unban`, {
    method: 'POST',
  });
  await assertOk(response);
}

export async function fetchAdminPendingOrders(): Promise<AdminRechargeOrder[]> {
  const response = await apiFetch('/api/admin/orders', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as AdminRechargeOrder[];
}

export async function approveAdminOrder(orderId: number): Promise<AdminRechargeOrder> {
  const response = await apiFetch(`/api/admin/orders/${orderId}/approve`, {
    method: 'POST',
  });
  await assertOk(response);
  return (await response.json()) as AdminRechargeOrder;
}

export async function rejectAdminOrder(orderId: number): Promise<AdminRechargeOrder> {
  const response = await apiFetch(`/api/admin/orders/${orderId}/reject`, {
    method: 'POST',
  });
  await assertOk(response);
  return (await response.json()) as AdminRechargeOrder;
}

export async function fetchAdminUserSessions(
  userId: number,
  page: number,
  pageSize: number,
): Promise<AdminUserSessionsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await apiFetch(`/api/admin/users/${userId}/sessions?${params.toString()}`, { cache: 'no-store' });
  await assertOk(response);
  const payload = (await response.json()) as AdminUserSessionsResponse;
  return {
    ...payload,
    items: (payload.items ?? []).map((item): AdminUserSession => ({
      session_id: item.session_id,
      filename: item.filename,
      total_pages: item.total_pages,
      created_at: item.created_at,
    })),
  };
}

export async function deleteUser(userId: number): Promise<void> {
  const response = await apiFetch(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });
  await assertOk(response);
}

export async function fetchInviteCodes(): Promise<AdminInviteCode[]> {
  const response = await apiFetch('/api/admin/invite-codes', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as AdminInviteCode[];
}

export async function createInviteCode(maxUses: number, note: string): Promise<AdminInviteCode> {
  const response = await apiFetch('/api/admin/invite-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_uses: maxUses, note }),
  });
  await assertOk(response);
  return (await response.json()) as AdminInviteCode;
}

export async function removeInviteCode(codeId: number): Promise<void> {
  const response = await apiFetch(`/api/admin/invite-codes/${codeId}`, {
    method: 'DELETE',
  });
  await assertOk(response);
}

export async function fetchAnnouncement(): Promise<Announcement> {
  const response = await apiFetch('/api/announcement', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as Announcement;
}

export async function publishAnnouncement(content: string): Promise<AdminAnnouncement> {
  const response = await apiFetch('/api/admin/announcement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  await assertOk(response);
  return (await response.json()) as AdminAnnouncement;
}

export async function clearAnnouncement(): Promise<void> {
  const response = await apiFetch('/api/admin/announcement', {
    method: 'DELETE',
  });
  await assertOk(response);
}

export async function getRechargePackages(): Promise<RechargePackage[]> {
  const response = await apiFetch('/api/recharge/packages', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as RechargePackage[];
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const response = await apiFetch('/api/recharge/status', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as StorageStatus;
}

export async function createOrder(packageId: string): Promise<{ order_id: number }> {
  const response = await apiFetch('/api/recharge/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package_id: packageId }),
  });
  await assertOk(response);
  return (await response.json()) as { order_id: number };
}

export async function confirmOrder(orderId: number): Promise<void> {
  const response = await apiFetch(`/api/recharge/order/${orderId}/confirm`, {
    method: 'POST',
  });
  await assertOk(response);
}

export async function getUserOrders(): Promise<RechargeOrder[]> {
  const response = await apiFetch('/api/recharge/orders', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as RechargeOrder[];
}

export async function uploadPdf(
  file: File,
  model: string,
): Promise<UploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('model', model);

  const response = await apiFetch('/api/upload', {
    method: 'POST',
    body: form,
  });
  await assertOk(response);
  return (await response.json()) as UploadResponse;
}

export async function fetchSessions(): Promise<SessionMeta[]> {
  const response = await apiFetch('/api/sessions', { cache: 'no-store' });
  await assertOk(response);
  return (await response.json()) as SessionMeta[];
}

export async function fetchSession(sessionId: string): Promise<SessionResponse> {
  const response = await apiFetch(`/api/session/${sessionId}`, {
    cache: 'no-store',
  });
  await assertOk(response);
  return (await response.json()) as SessionResponse;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await apiFetch(`/api/session/${sessionId}`, {
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
  options?: { force?: boolean; withContext?: boolean },
): Promise<void> {
  const params = new URLSearchParams();
  if (options?.force) params.set('force', 'true');
  if (options?.withContext) params.set('with_context', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch(
    `/api/explain/${sessionId}/${pageNumber}${qs}`,
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
  images: string[] | undefined,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await apiFetch(`/api/chat/${sessionId}/${pageNumber}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...apiKeyHeaders(model),
    },
    body: JSON.stringify({ message, images: images ?? [], model }),
    signal,
  });
  await assertOk(response);
  await parseSSE(response, onEvent, signal);
}

export async function clearChatHistory(sessionId: string, pageNumber: number): Promise<void> {
  const response = await apiFetch(`/api/chat/${sessionId}/${pageNumber}/history`, {
    method: 'DELETE',
  });
  await assertOk(response);
}

export async function searchSession(sessionId: string, q: string): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  const response = await apiFetch(`/api/session/${sessionId}/search?${params.toString()}`, {
    cache: 'no-store',
  });
  await assertOk(response);
  return (await response.json()) as SearchResponse;
}

export type PdfSource = string | { url: string; httpHeaders: Record<string, string> };

export function getPdfSource(sessionId: string): PdfSource {
  const url = `${API_BASE}/api/file/${sessionId}/original`;
  const token = getStoredToken();
  if (!token) return url;
  return {
    url,
    httpHeaders: {
      Authorization: `Bearer ${token}`,
    },
  };
}





