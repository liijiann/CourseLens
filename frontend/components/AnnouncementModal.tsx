import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';

import { fetchAnnouncement } from '@/lib/api';

const ANNOUNCEMENT_READ_KEY_PREFIX = 'courselens:announcement_read:';

function getAnnouncementStorageId(
  id: number | null | undefined,
  createdAt: string | null | undefined,
  content: string,
): string {
  if (id != null) return String(id);
  if (createdAt) return createdAt;
  return content;
}

export function AnnouncementModal() {
  const announcementQuery = useQuery({
    queryKey: ['announcement'],
    queryFn: fetchAnnouncement,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  const [dismissed, setDismissed] = useState(false);

  const content = (announcementQuery.data?.content ?? '').trim();
  const readKey = useMemo(() => {
    if (!content) return '';
    const storageId = getAnnouncementStorageId(
      announcementQuery.data?.id,
      announcementQuery.data?.created_at,
      content,
    );
    return `${ANNOUNCEMENT_READ_KEY_PREFIX}${storageId}`;
  }, [announcementQuery.data?.created_at, announcementQuery.data?.id, content]);

  useEffect(() => {
    if (!readKey || typeof window === 'undefined') {
      setDismissed(false);
      return;
    }
    setDismissed(window.sessionStorage.getItem(readKey) === '1');
  }, [readKey]);

  function handleDismiss() {
    if (readKey && typeof window !== 'undefined') {
      window.sessionStorage.setItem(readKey, '1');
    }
    setDismissed(true);
  }

  if (announcementQuery.isPending || announcementQuery.isError || !content || dismissed) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_22px_70px_rgba(15,23,42,0.22)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.62)]">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-slate-600 dark:text-[var(--dark-muted)]" />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)]">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-[var(--dark-muted)]">
            {content}
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={handleDismiss}
            className="w-full rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-[var(--dark-accent)] dark:hover:opacity-90"
          >
            {'\u6211\u77e5\u9053\u4e86'}
          </button>
        </div>
      </div>
    </div>
  );
}
