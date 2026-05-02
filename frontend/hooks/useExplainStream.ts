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
  // Pending chunk buffers per page — flushed via rAF to batch setState calls
  const chunkBuffers = useRef<Map<number, string>>(new Map());
  const rafHandle = useRef<number | null>(null);

  const flushChunks = useCallback(() => {
    rafHandle.current = null;
    for (const [page, text] of chunkBuffers.current.entries()) {
      if (!text) continue;
      updatePage(page, (current) => ({
        ...current,
        explanation: current.explanation + text,
      }));
    }
    chunkBuffers.current.clear();
  }, [updatePage]);

  const scheduleFlush = useCallback(() => {
    if (rafHandle.current !== null) return;
    rafHandle.current = requestAnimationFrame(flushChunks);
  }, [flushChunks]);

  const runStream = useCallback(
    async (
      pageNumber: number,
      controller: AbortController,
      options?: { force?: boolean; withContext?: boolean },
    ) => {
      if (!session) return;
      updatePage(pageNumber, (current) => ({
        ...current,
        status: 'loading',
        error: '',
        explanation: options?.force ? '' : (current.status === 'error' ? '' : current.explanation),
      }));

      try {
        await streamExplanation(
          sessionId,
          pageNumber,
          session.model,
          (event) => {
            if (event.type === 'chunk') {
              // Buffer chunks and flush via rAF to batch React state updates
              chunkBuffers.current.set(
                pageNumber,
                (chunkBuffers.current.get(pageNumber) ?? '') + event.content,
              );
              scheduleFlush();
              return;
            }
            if (event.type === 'done') {
              // Flush any remaining buffered chunks before marking done
              if (rafHandle.current !== null) {
                cancelAnimationFrame(rafHandle.current);
                rafHandle.current = null;
              }
              flushChunks();
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
          options,
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
        chunkBuffers.current.delete(pageNumber);
        explainControllers.current.delete(pageNumber);
      }
    },
    [session, sessionId, updatePage, scheduleFlush, flushChunks],
  );

  const startExplain = useCallback(
    async (pageNumber: number) => {
      if (!session || pageNumber < 1 || pageNumber > session.totalPages) return;
      const now = pagesRef.current[pageNumber] ?? EMPTY_PAGE_STATE;
      if (now.status === 'done') return;
      if (explainControllers.current.has(pageNumber)) return;

      const controller = new AbortController();
      explainControllers.current.set(pageNumber, controller);
      await runStream(pageNumber, controller);
    },
    [pagesRef, runStream, session],
  );

  const forceExplain = useCallback(
    async (pageNumber: number) => {
      if (!session || pageNumber < 1 || pageNumber > session.totalPages) return;

      explainControllers.current.get(pageNumber)?.abort();
      explainControllers.current.delete(pageNumber);

      const controller = new AbortController();
      explainControllers.current.set(pageNumber, controller);
      await runStream(pageNumber, controller, { force: true });
    },
    [runStream, session],
  );

  const explainWithContext = useCallback(
    async (pageNumber: number) => {
      if (!session || pageNumber < 1 || pageNumber > session.totalPages) return;

      explainControllers.current.get(pageNumber)?.abort();
      explainControllers.current.delete(pageNumber);

      const controller = new AbortController();
      explainControllers.current.set(pageNumber, controller);
      await runStream(pageNumber, controller, { force: true, withContext: true });
    },
    [runStream, session],
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
      if (rafHandle.current !== null) cancelAnimationFrame(rafHandle.current);
      for (const controller of explainControllers.current.values()) {
        controller.abort();
      }
      explainControllers.current.clear();
      chunkBuffers.current.clear();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;

    abortExplainOutsideWindow(currentPage, session.totalPages);

    let prefetchTimer: number | null = null;
    const timer = window.setTimeout(() => {
      startExplain(currentPage);

      prefetchTimer = window.setTimeout(() => {
        startExplain(currentPage - 1);
        startExplain(currentPage + 1);
      }, PREFETCH_DELAY_MS);
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      if (prefetchTimer !== null) {
        window.clearTimeout(prefetchTimer);
      }
    };
  }, [abortExplainOutsideWindow, currentPage, session, startExplain]);

  return { startExplain, forceExplain, explainWithContext };
}
