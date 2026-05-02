import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { CourseSidebar } from '@/components/CourseSidebar';
import { UploadModal } from '@/components/UploadModal';
import { clearStoredToken, fetchMe, getStoredApiKey, setStoredApiKey } from '@/lib/api';
import { AnnouncementModal } from '@/components/AnnouncementModal';

export default function HomePage() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(() => Boolean(getStoredApiKey('dashscope').trim()));
  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getStoredApiKey('dashscope'));
  const [apiKeyError, setApiKeyError] = useState('');

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: 0,
  });

  function handleLogout() {
    clearStoredToken();
    navigate('/login', { replace: true });
  }

  function saveApiKey() {
    const value = apiKeyInput.trim();
    if (!value) {
      setApiKeyError('\u8bf7\u5148\u586b\u5199 API Key');
      return;
    }
    setStoredApiKey('dashscope', value);
    setHasApiKey(true);
    setApiKeyError('');
  }

  useEffect(() => {
    function handleFocus() {
      const hasKey = Boolean(getStoredApiKey('dashscope').trim());
      setHasApiKey(hasKey);
      if (hasKey) {
        setApiKeyError('');
      }
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <main className="relative flex h-screen overflow-hidden bg-white dark:bg-[var(--dark-bg)]">
      <section className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center px-6">
        <div className="absolute right-6 top-6 z-20 flex items-center gap-2">
          {meQuery.data?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              {'\u7ba1\u7406\u540e\u53f0'}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
          >
            {'\u9000\u51fa\u767b\u5f55'}
          </button>
        </div>

        <div className="rounded-2xl bg-white/75 px-8 py-8 text-center shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm dark:bg-[var(--dark-surface)]/88 dark:shadow-[0_18px_56px_rgba(0,0,0,0.62)]">
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-[var(--dark-text)]">CourseLens</h1>
          <p className="mb-6 mt-3 text-sm text-slate-500 dark:text-[var(--dark-muted)]">
            {'\u9009\u62e9\u4e00\u4e2a\u8bfe\u4ef6\u5f00\u59cb\u5b66\u4e60'}
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="home-upload-btn rounded-xl bg-gray-900 px-5 py-2 text-sm text-white transition-colors hover:bg-black dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)]"
          >
            {'\u4e0a\u4f20 PDF'}
          </button>
        </div>
      </section>

      <aside className="h-full shrink-0">
        <CourseSidebar open />
      </aside>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      <AnnouncementModal />

      {!hasApiKey && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_22px_70px_rgba(15,23,42,0.22)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.62)]">
            <h2 className="text-base font-semibold text-slate-800 dark:text-[var(--dark-text)]">{'\u9700\u8981\u5148\u914d\u7f6e API Key'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-[var(--dark-muted)]">
              {'\u8bf7\u5148\u524d\u5f80\u767e\u70bc\u63a7\u5236\u53f0\u83b7\u53d6\u5e76\u586b\u5199\u3002'}
            </p>
            <div className="mt-4">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  if (apiKeyError) setApiKeyError('');
                }}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <a
                href="https://bailian.console.aliyun.com/"
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-slate-50 dark:border-[var(--dark-border)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
              >
                {'\u524d\u5f80\u767e\u70bc\u63a7\u5236\u53f0'}
              </a>
              <button
                type="button"
                onClick={saveApiKey}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white transition hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
              >
                {'\u4fdd\u5b58'}
              </button>
            </div>
            {apiKeyError && <p className="mt-3 text-xs text-rose-500">{apiKeyError}</p>}
          </div>
        </div>
      )}
    </main>
  );
}
