export type BackendPageStatus = 'pending' | 'streaming' | 'done' | 'failed';
export type FrontendPageStatus = 'idle' | 'loading' | 'done' | 'error';
export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
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
