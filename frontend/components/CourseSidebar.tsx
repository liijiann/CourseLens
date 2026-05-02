import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteSession, fetchSession, fetchSessions } from '@/lib/api';
import { MODELS } from '@/lib/models';
import { SessionMeta } from '@/lib/types';

function getModelLabel(model: string): string {
  return MODELS.find((m) => m.value === model)?.label ?? model;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${month}\u6708${day}\u65e5 ${hh}:${mm}`;
  } catch {
    return '';
  }
}

interface CourseSidebarProps {
  open: boolean;
  activeSessionId?: string;
}

export function CourseSidebar({ open, activeSessionId }: CourseSidebarProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    enabled: open,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const sessions = sessionsQuery.data ?? [];

  function prefetchSession(sessionId: string): void {
    void queryClient.prefetchQuery({
      queryKey: ['session', sessionId],
      queryFn: () => fetchSession(sessionId),
      staleTime: 10_000,
    });
  }

  async function handleDelete(session: SessionMeta): Promise<void> {
    const ok = window.confirm(`\u786e\u5b9a\u5220\u9664\u300c${session.filename}\u300d\u5417\uff1f\u5220\u9664\u540e\u4e0d\u53ef\u6062\u590d\u3002`);
    if (!ok) return;

    setDeletingId(session.sessionId);
    try {
      await deleteSession(session.sessionId);
      queryClient.setQueryData<SessionMeta[]>(['sessions'], (prev) => (
        (prev ?? []).filter((item) => item.sessionId !== session.sessionId)
      ));
      queryClient.removeQueries({ queryKey: ['session', session.sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['storage-status'] });

      if (session.sessionId === activeSessionId) {
        navigate('/');
      }
    } catch {
      window.alert('\u5220\u9664\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5');
    } finally {
      setDeletingId((current) => (current === session.sessionId ? null : current));
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const keyword = search.toLowerCase();
    return sessions.filter((s) => s.filename.toLowerCase().includes(keyword));
  }, [search, sessions]);

  return (
    <div
      className={`flex h-full shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white transition-[width] duration-200 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] ${
        open ? 'w-56' : 'w-0'
      }`}
    >
      <div className="shrink-0 border-b border-gray-100 px-3 py-2 dark:border-[var(--dark-border)]">
        <div className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1 dark:bg-[var(--dark-surface-elev)]">
          <Search size={12} className="shrink-0 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-[var(--dark-text)]"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((session) => {
          const isActive = session.sessionId === activeSessionId;
          const deleting = deletingId === session.sessionId;

          return (
            <div
              key={session.sessionId}
              role="button"
              tabIndex={0}
              onMouseEnter={() => prefetchSession(session.sessionId)}
              onMouseDown={() => prefetchSession(session.sessionId)}
              onFocus={() => prefetchSession(session.sessionId)}
              onClick={() => navigate(`/study/${session.sessionId}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/study/${session.sessionId}`);
              }}
              className={`flex cursor-pointer select-none items-start gap-1.5 px-3 py-1.5 transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface-elev)]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs" title={session.filename}>
                  {session.filename}
                </span>
                <span className="block text-[10px] text-gray-400 dark:text-[var(--dark-muted)]">
                  {formatTime(session.createdAt)} {'\u00b7'} {session.totalPages}{'\u9875'}
                </span>
                <span className="block text-right text-[10px] text-gray-400 dark:text-[var(--dark-muted)]">
                  {getModelLabel(session.model)}
                </span>
              </div>
              <button
                type="button"
                title="\u5220\u9664\u8bfe\u4ef6"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(session);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                className={`shrink-0 rounded p-1 transition ${
                  isActive
                    ? 'text-gray-300 hover:bg-white/10 hover:text-red-300'
                    : 'text-gray-400 hover:bg-gray-200 hover:text-red-500 dark:hover:bg-[var(--dark-surface-elev)]'
                } disabled:opacity-40`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-gray-400 dark:text-[var(--dark-muted)]">
            {search
              ? '\u65e0\u5339\u914d\u8bfe\u4ef6'
              : sessionsQuery.isLoading
                ? '\u52a0\u8f7d\u4e2d...'
                : '\u6682\u65e0\u5386\u53f2\u8bfe\u4ef6'}
          </p>
        )}
      </div>
    </div>
  );
}
