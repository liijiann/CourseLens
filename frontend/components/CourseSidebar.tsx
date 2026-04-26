import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Trash2, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { deleteSession, fetchSessions } from '@/lib/api';
import { MODELS } from '@/lib/models';
import { SessionMeta } from '@/lib/types';

function getModelLabel(model: string): string {
  return MODELS.find((m) => m.value === model)?.label ?? model;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${day}日 ${hh}:${mm}`;
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

  async function handleDelete(session: SessionMeta): Promise<void> {
    const ok = window.confirm(`确定删除「${session.filename}」吗？删除后不可恢复。`);
    if (!ok) return;

    setDeletingId(session.sessionId);
    try {
      await deleteSession(session.sessionId);
      queryClient.setQueryData<SessionMeta[]>(['sessions'], (prev) => (
        (prev ?? []).filter((item) => item.sessionId !== session.sessionId)
      ));
      queryClient.removeQueries({ queryKey: ['session', session.sessionId] });

      if (session.sessionId === activeSessionId) {
        navigate('/');
      }
    } catch {
      window.alert('删除失败，请重试');
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
      className={`h-full flex flex-col bg-white dark:bg-[var(--dark-surface)] border-l border-gray-200 dark:border-[var(--dark-border)] shrink-0 overflow-hidden transition-[width] duration-200 ${
        open ? 'w-56' : 'w-0'
      }`}
    >
      <div className="px-3 py-2 border-b border-gray-100 dark:border-[var(--dark-border)] shrink-0">
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-[var(--dark-surface-elev)] rounded-lg px-2 py-1">
          <Search size={12} className="text-gray-400 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索课件..."
            className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 dark:text-[var(--dark-text)] placeholder:text-gray-400 dark:placeholder:text-[var(--dark-muted)] min-w-0"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600 dark:hover:text-[var(--dark-text)] shrink-0">
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((s) => {
          const isActive = s.sessionId === activeSessionId;
          const deleting = deletingId === s.sessionId;

          return (
            <div
              key={s.sessionId}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/study/${s.sessionId}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate(`/study/${s.sessionId}`);
              }}
              className={`flex items-start gap-1.5 px-3 py-1.5 cursor-pointer transition-colors select-none ${
                isActive
                  ? 'bg-gray-900 dark:bg-[var(--dark-surface-elev)] text-white dark:text-[var(--dark-text)]'
                  : 'text-gray-700 dark:text-[var(--dark-text)] hover:bg-gray-100 dark:hover:bg-[var(--dark-surface-elev)]'
              }`}
            >
              <div className="flex-1 min-w-0">
                <span className="block text-xs truncate" title={s.filename}>
                  {s.filename}
                </span>
                <span className="block text-[10px] text-gray-400 dark:text-[var(--dark-muted)]">
                  {formatTime(s.createdAt)} · {s.totalPages}页
                </span>
                <span className="block text-[10px] text-gray-400 dark:text-[var(--dark-muted)] text-right">
                  {getModelLabel(s.model)}
                </span>
              </div>
              <button
                type="button"
                title="删除课程"
                disabled={deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(s);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                className={`shrink-0 rounded p-1 transition ${
                  isActive
                    ? 'text-gray-300 hover:text-red-300 hover:bg-white/10'
                    : 'text-gray-400 hover:text-red-500 hover:bg-gray-200 dark:hover:bg-[var(--dark-surface-elev)]'
                } disabled:opacity-40`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-[var(--dark-muted)] text-center py-8">
            {search ? '无匹配课件' : sessionsQuery.isLoading ? '加载中...' : '暂无历史课件'}
          </p>
        )}
      </div>
    </div>
  );
}
