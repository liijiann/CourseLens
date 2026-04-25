import { useCallback, useEffect, useRef } from 'react';

import { streamExplanation } from '@/lib/api';
import { SessionResponse } from '@/lib/types';

import { EMPTY_PAGE_STATE, type PageViewState, type UpdatePageFn } from '@/hooks/useSessionState';

const PREFETCH_DELAY_MS = 180;
const DEBOUNCE_MS = 1500;

interface UseExplainStreamParams {
  sessionId: string;
  session: SessionResponse | null;
  currentPage: number;
  pagesRef: React.MutableRefObject<Record<number, PageViewState>>;
  updatePage: UpdatePageFn;
}

export function useExplainStream({
  sessionId,
  session,
  currentPage,
  pagesRef,
  updatePage,
}: UseExplainStreamParams) {
  const explainControllers = useRef<Map<number, AbortController>>(new Map());

  const startExplain = useCallback(
    async (pageNumber: number) => {
      if (!session || pageNumber < 1 || pageNumber > session.totalPages) return;

      const now = pagesRef.current[pageNumber] ?? EMPTY_PAGE_STATE;
      if (now.status === 'done') return;
      if (explainControllers.current.has(pageNumber)) return;

      const controller = new AbortController();
      explainControllers.current.set(pageNumber, controller);

      updatePage(pageNumber, (current) => ({
        ...current,
        status: 'loading',
        error: '',
        explanation: current.status === 'error' ? '' : current.explanation,
      }));

      try {
        await streamExplanation(
          sessionId,
          pageNumber,
          session.model,
          (event) => {
            if (event.type === 'chunk') {
              updatePage(pageNumber, (current) => ({
                ...current,
                explanation: current.explanation + event.content,
              }));
              return;
            }
            if (event.type === 'done') {
              updatePage(pageNumber, (current) => ({ ...current, status: 'done' }));
              return;
            }
            if (event.type === 'error') {
              updatePage(pageNumber, (current) => ({
                ...current,
                status: 'error',
                error: event.content,
              }));
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          updatePage(pageNumber, (current) => ({
            ...current,
            status: 'error',
            error: err instanceof Error ? err.message : '解读失败',
          }));
        }
      } finally {
        explainControllers.current.delete(pageNumber);
      }
    },
    [pagesRef, session, sessionId, updatePage],
  );

  const abortExplainOutsideWindow = useCallback(
    (centerPage: number, totalPages: number) => {
      const keep = new Set<number>();
      for (let page = centerPage - 1; page <= centerPage + 1; page += 1) {
        if (page >= 1 && page <= totalPages) keep.add(page);
      }

      for (const [page, controller] of explainControllers.current.entries()) {
        if (keep.has(page)) continue;
        controller.abort();
        explainControllers.current.delete(page);
        updatePage(page, (current) => (
          current.status === 'loading' ? { ...current, status: 'idle' } : current
        ));
      }
    },
    [updatePage],
  );

  useEffect(() => {
    return () => {
      for (const controller of explainControllers.current.values()) {
        controller.abort();
      }
      explainControllers.current.clear();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;

    abortExplainOutsideWindow(currentPage, session.totalPages);

    const timer = window.setTimeout(() => {
      startExplain(currentPage);

      window.setTimeout(() => {
        startExplain(currentPage - 1);
        startExplain(currentPage + 1);
      }, PREFETCH_DELAY_MS);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [abortExplainOutsideWindow, currentPage, session, startExplain]);

  return { startExplain };
}
