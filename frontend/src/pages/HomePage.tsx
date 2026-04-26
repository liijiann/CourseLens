import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

import { UploadModal } from '@/components/UploadModal';
import { fetchSessions, getStoredApiKey, setStoredApiKey } from '@/lib/api';

function ApiKeySetup({ onDone }: { onDone: () => void }) {
  const [key, setKey] = useState('');

  function handleSave() {
    const trimmed = key.trim();
    if (!trimmed) return;
    setStoredApiKey('dashscope', trimmed);
    onDone();
  }

  return (
    <div className="w-[360px] rounded-2xl bg-white/75 px-8 py-8 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-[var(--dark-surface)]/88 dark:shadow-[0_18px_56px_rgba(0,0,0,0.62)]">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-[var(--dark-text)]">CourseLens</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-[var(--dark-muted)]">需要配置 DashScope API Key 才能使用</p>
      <p className="mt-1.5 text-xs text-amber-500/90 dark:text-amber-400/80">通过 API Key 调用大模型会产生少量费用，请注意账户余额。</p>

      <a
        href="https://bailian.console.aliyun.com/"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
      >
        前往百炼控制台获取 Key
        <ExternalLink size={13} />
      </a>

      <div className="mt-4">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={!key.trim()}
        className="mt-3 w-full rounded-xl bg-gray-900 py-2.5 text-sm text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)]"
      >
        保存并开始
      </button>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hasKey, setHasKey] = useState(() => !!getStoredApiKey('dashscope'));

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
    enabled: hasKey,
  });

  useEffect(() => {
    if (!sessionsQuery.data || sessionsQuery.data.length === 0) return;
    navigate(`/study/${sessionsQuery.data[0].sessionId}`, { replace: true });
  }, [navigate, sessionsQuery.data]);

  if (!hasKey) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[var(--dark-bg)]">
        <ApiKeySetup onDone={() => setHasKey(true)} />
      </main>
    );
  }

  const booting = sessionsQuery.isPending || (!!sessionsQuery.data && sessionsQuery.data.length > 0);

  if (booting) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[var(--dark-bg)]">
        <p className="text-sm text-slate-400 dark:text-[var(--dark-muted)]">正在进入...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 dark:bg-[var(--dark-bg)]">
      {open ? (
        <UploadModal onClose={() => setOpen(false)} />
      ) : (
        <div className="rounded-2xl bg-white/75 px-8 py-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-[var(--dark-surface)]/88 dark:shadow-[0_18px_56px_rgba(0,0,0,0.62)]">
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-[var(--dark-text)]">CourseLens</h1>
          <p className="mb-6 mt-3 text-sm text-slate-500 dark:text-[var(--dark-muted)]">选择一个课件开始学习</p>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl bg-gray-900 px-5 py-2 text-sm text-white transition-colors hover:bg-black dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)]"
          >
            上传 PDF
          </button>
        </div>
      )}
    </main>
  );
}
