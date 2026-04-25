import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchSession } from '@/lib/api';
import { ChatTurn, FrontendPageStatus, SessionPage, SessionResponse } from '@/lib/types';

export interface PageViewState {
  status: FrontendPageStatus;
  explanation: string;
  error: string;
  chat: ChatTurn[];
}

export type UpdatePageFn = (
  pageNumber: number,
  updater: (current: PageViewState) => PageViewState,
) => void;

export const EMPTY_PAGE_STATE: PageViewState = {
  status: 'idle',
  explanation: '',
  error: '',
  chat: [],
};

const SESSION_PAGE_PROGRESS_KEY = 'courselens:sessionPageProgress';

function readSessionPageProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SESSION_PAGE_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function getSavedPage(sessionId: string, totalPages: number): number {
  const all = readSessionPageProgress();
  const saved = all[sessionId];
  if (!saved) return 1;
  return Math.max(1, Math.min(totalPages, saved));
}

function savePageProgress(sessionId: string, pageNumber: number): void {
  if (!sessionId || pageNumber < 1) return;
  try {
    const all = readSessionPageProgress();
    all[sessionId] = pageNumber;
    localStorage.setItem(SESSION_PAGE_PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage write failures (private mode / quota).
  }
}

function mapPageStatus(page: SessionPage): FrontendPageStatus {
  if (page.status === 'done') return 'done';
  if (page.status === 'streaming') return 'idle';
  if (page.status === 'failed') return 'error';
  return 'idle';
}

function mapPages(payload: SessionResponse): Record<number, PageViewState> {
  const mapped: Record<number, PageViewState> = {};
  for (const page of payload.pages) {
    mapped[page.pageNumber] = {
      status: mapPageStatus(page),
      explanation: page.explanation || '',
      error: page.lastError || '',
      chat: page.chat || [],
    };
  }
  return mapped;
}

export function useSessionState(sessionId: string) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState<Record<number, PageViewState>>({});
  const pagesRef = useRef<Record<number, PageViewState>>({});

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId),
    enabled: sessionId.length > 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const session = sessionQuery.data ?? null;
  const loadingSession = sessionQuery.isPending;
  const sessionError = sessionQuery.isError
    ? (sessionQuery.error instanceof Error ? sessionQuery.error.message : '加载失败')
    : '';

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const updatePage = useCallback<UpdatePageFn>((pageNumber, updater) => {
    setPages((prev) => {
      const current = prev[pageNumber] ?? EMPTY_PAGE_STATE;
      return { ...prev, [pageNumber]: updater(current) };
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setPages({});
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    setCurrentPage(getSavedPage(session.sessionId, session.totalPages));
    setPages(mapPages(session));
  }, [session?.sessionId, sessionQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!session) return;
    const next = Math.max(1, Math.min(session.totalPages, currentPage));
    savePageProgress(session.sessionId, next);
  }, [session, currentPage]);

  return {
    session,
    loadingSession,
    sessionError,
    currentPage,
    setCurrentPage,
    pages,
    pagesRef,
    updatePage,
  };
}
