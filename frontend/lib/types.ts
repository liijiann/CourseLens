export type BackendPageStatus = 'pending' | 'streaming' | 'done' | 'failed';
export type FrontendPageStatus = 'idle' | 'loading' | 'done' | 'error';
export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
  images?: string[];
}

export interface SessionPage {
  pageNumber: number;
  status: BackendPageStatus;
  explanation: string;
  chat: ChatTurn[];
  lastError: string;
}

export interface SessionMeta {
  sessionId: string;
  filename: string;
  totalPages: number;
  createdAt: string;
  model: string;
}

export interface SessionResponse extends SessionMeta {
  pages: SessionPage[];
}

export interface UploadResponse {
  sessionId: string;
  totalPages: number;
  filename: string;
}

export type StreamEventType = 'chunk' | 'done' | 'error';

export interface StreamEvent {
  type: StreamEventType;
  content: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

export interface Announcement {
  id?: number | null;
  content: string | null;
  created_at?: string | null;
}

export interface AdminAnnouncement {
  id: number;
  content: string;
  created_at: string;
  is_active: number;
}

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
}

export interface AdminUser {
  id: number;
  email: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  session_count: number;
  total_pages: number;
  storage_quota_mb: number;
  storage_used_mb: number;
  storage_used_percent: number;
}

export interface AdminInviteCode {
  id: number;
  code: string;
  max_uses: number;
  used_count: number;
  note: string;
  created_at: string;
}

export interface AdminUserSession {
  session_id: string;
  filename: string;
  total_pages: number;
  created_at: string;
}

export interface AdminUserSessionsResponse {
  items: AdminUserSession[];
  page: number;
  page_size: number;
  total_items: number;
  total_file_pages: number;
}

export interface RechargePackage {
  id: string;
  name: string;
  quota_mb: number;
  price_fen: number;
}

export interface StorageStatus {
  quota_mb: number;
  used_mb: number;
  used_percent: number;
}

export interface RechargeOrder {
  id: number;
  user_id: number;
  package_id: string;
  quota_mb: number;
  amount_fen: number;
  status: 'pending' | 'paid' | 'cancelled';
  created_at: string;
  paid_at: string | null;
}

export interface AdminRechargeOrder extends RechargeOrder {
  user_email: string;
}

export interface SearchResultItem {
  pageNumber: number;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}
