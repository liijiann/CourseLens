import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, LayoutList, Moon, Search, Settings, Sun, X } from 'lucide-react';

import { AnnouncementModal } from '@/components/AnnouncementModal';
import ChatBox from '@/components/ChatBox';
import { CourseSidebar } from '@/components/CourseSidebar';
import ExplanationPanel from '@/components/ExplanationPanel';
import PDFViewer from '@/components/PDFViewer';
import ReminderCat from '@/components/ReminderCat';
import { SettingsModal } from '@/components/SettingsModal';
import { UploadModal } from '@/components/UploadModal';
import { useBubbleStyle } from '@/hooks/useBubbleStyle';
import { useChatStream } from '@/hooks/useChatStream';
import { useExplainStream } from '@/hooks/useExplainStream';
import { EMPTY_PAGE_STATE, useSessionState } from '@/hooks/useSessionState';
import { Theme, useThemePreference } from '@/hooks/useThemePreference';
import {
  clearStoredToken,
  fetchMe,
  fetchSessions,
  getPdfSource,
  getStorageStatus,
  INVALID_API_KEY_EVENT,
  searchSession,
} from '@/lib/api';
import type { SearchResultItem } from '@/lib/types';
import {
  isReadingFontSize,
  nextReadingFontSize,
  READING_FONT_SIZE_LABEL,
  READING_FONT_SIZE_STORAGE_KEY,
  ReadingFontSize,
} from '@/lib/readingFontSize';

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === 'dark') return <Moon size={15} />;
  if (theme === 'warm') return <Flame size={15} className="text-amber-600" />;
  return <Sun size={15} />;
}

export default function StudyPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { theme, cycleTheme } = useThemePreference();
  const { bubbleStyle, setBubbleStyle } = useBubbleStyle();
  const {
    session,
    loadingSession,
    sessionError,
    switchingSession,
    currentPage,
    setCurrentPage,
    pages,
    pagesRef,
    updatePage,
  } = useSessionState(sessionId);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: 0,
  });
  const storageQuery = useQuery({
    queryKey: ['storage-status'],
    queryFn: getStorageStatus,
    retry: 1,
  });

  const [activeTab, setActiveTab] = useState<'explain' | 'chat'>('explain');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Search state (lifted from PDFViewer)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [readingFontSize, setReadingFontSize] = useState<ReadingFontSize>(() => {
    const saved = localStorage.getItem(READING_FONT_SIZE_STORAGE_KEY);
    return isReadingFontSize(saved) ? saved : 'medium';
  });

  useEffect(() => {
    const saved = localStorage.getItem('courselens:sidebarOpen');
    if (saved != null) {
      setSidebarOpen(saved === 'true');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('courselens:sidebarOpen', String(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem(READING_FONT_SIZE_STORAGE_KEY, readingFontSize);
  }, [readingFontSize]);

  const currentState = pages[currentPage] ?? EMPTY_PAGE_STATE;
  const canAsk = currentState.status === 'done' && currentState.explanation.length > 0;
  const totalPages = session?.totalPages ?? 1;

  const { startExplain, forceExplain, explainWithContext } = useExplainStream({
    sessionId,
    session,
    currentPage,
    pagesRef,
    updatePage,
  });

  const {
    chatInput,
    setChatInput,
    chatImages,
    chatSending,
    chatModel,
    setChatModel,
    clearingHistory,
    chatDraftAnswer,
    sendChat,
    sendChatMessage,
    addChatImages,
    removeChatImage,
    clearHistory,
    abortChat,
  } = useChatStream({
    session,
    currentPage,
    canAsk,
    updatePage,
  });

  const handleQuickAsk = useCallback((message: string) => {
    void sendChatMessage(message);
  }, [sendChatMessage]);

  const handlePrev = useCallback(() => setCurrentPage((p) => Math.max(1, p - 1)), [setCurrentPage]);
  const handleNext = useCallback(
    () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
    [setCurrentPage, totalPages],
  );
  const handleGoToPage = useCallback((page: number) => setCurrentPage(page), [setCurrentPage]);
  const prefetchSessions = useCallback(() => {
    void queryClient.prefetchQuery({
      queryKey: ['sessions'],
      queryFn: fetchSessions,
      staleTime: 10_000,
    });
  }, [queryClient]);

  // Search handlers
  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);
  useEffect(() => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError('');
    setSearchOpen(false);
  }, [sessionId]);
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await searchSession(sessionId, q);
      setSearchResults(res.results);
      if (res.results.length === 0) setSearchError('未找到匹配内容');
    } catch {
      setSearchError('搜索失败，请重试');
    } finally {
      setSearchLoading(false);
    }
  }, [sessionId, searchQuery]);
  const handleLogout = useCallback(() => {
    clearStoredToken();
    navigate('/login', { replace: true });
  }, [navigate]);

  const handleGoAdminFromSettings = useCallback(() => {
    setShowSettings(false);
    navigate('/admin');
  }, [navigate]);

  useEffect(() => {
    setActiveTab('explain');
  }, [currentPage]);

  useEffect(() => {
    function handleInvalidApiKey() {
      setShowSettings(true);
      window.alert('API Key 无效或已失效，请重新配置。');
    }

    window.addEventListener(INVALID_API_KEY_EVENT, handleInvalidApiKey);
    return () => {
      window.removeEventListener(INVALID_API_KEY_EVENT, handleInvalidApiKey);
    };
  }, []);

  const pdfUrl = useMemo(() => getPdfSource(sessionId), [sessionId]);
  const storageUsedPercent = storageQuery.data?.used_percent ?? 0;
  const storageBarColor = storageUsedPercent >= 100 ? 'bg-red-500' : storageUsedPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500';

  if (!sessionId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-warn dark:bg-[var(--dark-bg)]">
        会话参数缺失
      </main>
    );
  }

  if (loadingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-600 dark:bg-[var(--dark-bg)] dark:text-[var(--dark-muted)]">
        正在加载会话...
      </main>
    );
  }

  if (sessionError || !session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white text-warn dark:bg-[var(--dark-bg)]">
        会话加载失败：{sessionError || '未知错误'}
      </main>
    );
  }

  return (
    <main className="relative flex h-screen flex-col overflow-hidden bg-white dark:bg-[var(--dark-bg)]">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-sm font-semibold text-slate-800 dark:text-[var(--dark-text)]">CourseLens</span>
          <span className="text-slate-300 dark:text-[var(--dark-muted)]">/</span>
          <span
            className="max-w-[240px] truncate text-xs text-slate-500 dark:text-[var(--dark-muted)]"
            title={session.filename}
          >
            {session.filename}
          </span>
          {storageQuery.data && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-[11px] text-slate-500 dark:text-[var(--dark-muted)]">
                {storageQuery.data.used_mb.toFixed(2)}MB / {storageQuery.data.quota_mb}MB
              </span>
              <div className="h-1.5 w-24 rounded-full bg-slate-100 dark:bg-[var(--dark-surface-elev)]">
                <div
                  className={`h-1.5 rounded-full ${storageBarColor}`}
                  style={{ width: `${Math.min(100, storageUsedPercent)}%` }}
                />
              </div>
              {storageUsedPercent > 80 && (
                <span className={`text-[11px] ${storageUsedPercent >= 100 ? 'text-red-500' : 'text-amber-500'}`}>
                  {storageUsedPercent >= 100 ? '空间已满，请充值' : '空间即将用完'}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={cycleTheme}
            title="切换主题"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            <ThemeIcon theme={theme} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="设置"
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            <Settings size={15} />
          </button>
          <button
            onClick={() => navigate('/recharge')}
            title="充值"
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-700 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            充值
          </button>
          <button
            onClick={handleLogout}
            className="rounded-lg px-2.5 py-1.5 text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-700 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            退出登录
          </button>
          <button
            onClick={() => setShowUpload(true)}
            title="上传新 PDF"
            className="study-upload-btn rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-black dark:border dark:border-white/15 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-white"
          >
            上传
          </button>
          <button
            onMouseEnter={prefetchSessions}
            onMouseDown={prefetchSessions}
            onFocus={prefetchSessions}
            onClick={() => {
              if (!sidebarOpen) {
                prefetchSessions();
              }
              setSidebarOpen((v) => !v);
            }}
            title="课程列表"
            className={`rounded-lg p-1.5 transition ${
              sidebarOpen
                ? 'bg-slate-100 text-slate-700 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]'
            }`}
          >
            <LayoutList size={15} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 overflow-hidden border-r border-slate-100 dark:border-[var(--dark-border)]" style={{ width: '65%' }}>
            <PDFViewer
              sessionId={sessionId}
              pdfUrl={pdfUrl}
              pageNumber={currentPage}
              totalPages={session.totalPages}
              onPrev={handlePrev}
              onNext={handleNext}
              onGoToPage={handleGoToPage}
              searchOpen={searchOpen}
              onSearchToggle={() => setSearchOpen((v) => !v)}
              highlightQuery={searchResults.length > 0 ? searchQuery : ''}
            />
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ width: '35%' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 pt-2 dark:border-[var(--dark-border)]">
              <div className="segmented-control flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('explain')}
                  className={`rounded-lg px-4 py-1.5 text-xs transition-colors ${
                    activeTab === 'explain'
                      ? 'bg-gray-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]'
                  }`}
                >
                  解读
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (canAsk) setActiveTab('chat');
                  }}
                  disabled={!canAsk}
                  className={`rounded-lg px-4 py-1.5 text-xs transition-colors ${
                    activeTab === 'chat'
                      ? 'bg-gray-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                      : 'text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]'
                  }`}
                >
                  追问
                </button>
              </div>
              <button
                type="button"
                onClick={() => setReadingFontSize((size) => nextReadingFontSize(size))}
                className="rounded-lg px-4 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-100 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
                title="切换字号"
              >
                {READING_FONT_SIZE_LABEL[readingFontSize]}
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <div
                className={`absolute inset-0 transition-all duration-200 ${
                  activeTab === 'chat'
                    ? 'pointer-events-auto translate-x-0 opacity-100'
                    : 'pointer-events-none translate-x-2 opacity-0'
                }`}
                aria-hidden={activeTab !== 'chat'}
              >
                <ChatBox
                  chat={currentState.chat}
                  draftAnswer={chatDraftAnswer}
                  input={chatInput}
                  images={chatImages}
                  model={chatModel}
                  sending={chatSending}
                  clearingHistory={clearingHistory}
                  onInputChange={setChatInput}
                  onModelChange={setChatModel}
                  onAddImages={addChatImages}
                  onRemoveImage={removeChatImage}
                  onClearHistory={() => void clearHistory()}
                  onSend={sendChat}
                  bubbleStyle={bubbleStyle}
                  fontSize={readingFontSize}
                />
              </div>

              <div
                className={`absolute inset-0 transition-all duration-200 ${
                  activeTab === 'explain'
                    ? 'pointer-events-auto translate-x-0 opacity-100'
                    : 'pointer-events-none -translate-x-2 opacity-0'
                }`}
                aria-hidden={activeTab !== 'explain'}
              >
                <ExplanationPanel
                  sessionId={sessionId}
                  pageNumber={currentPage}
                  status={currentState.status}
                  explanation={currentState.explanation}
                  error={currentState.error}
                  chat={currentState.chat}
                  draftAnswer={chatDraftAnswer}
                  canAsk={canAsk}
                  askSending={chatSending}
                  bubbleStyle={bubbleStyle}
                  fontSize={readingFontSize}
                  onRetry={() => {
                    updatePage(currentPage, (current) => ({
                      ...current,
                      status: 'idle',
                      explanation: '',
                      error: '',
                    }));
                    startExplain(currentPage);
                  }}
                  onRegenerate={() => void forceExplain(currentPage)}
                  onRegenerateWithContext={() => void explainWithContext(currentPage)}
                  onQuickAsk={handleQuickAsk}
                  onAbort={abortChat}
                />
              </div>
            </div>

            {/* 搜索悬浮层：absolute 覆盖在解读/追问内容之上 */}
            {searchOpen && (
              <div className="absolute inset-0 z-10 flex flex-col bg-white/95 backdrop-blur-sm dark:bg-[var(--dark-bg)]/95">
                {/* 搜索输入栏 */}
                <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-[var(--dark-border)]">
                  <Search size={13} className="shrink-0 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    placeholder="搜索 PDF 内容…"
                    onChange={(e) => { setSearchQuery(e.target.value); setSearchResults([]); setSearchError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(); if (e.key === 'Escape') setSearchOpen(false); }}
                    className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-[var(--dark-text)]"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setSearchError(''); }}
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-[var(--dark-text)]">
                      <X size={13} />
                    </button>
                  )}
                  <button type="button" onClick={() => void handleSearch()} disabled={!searchQuery.trim() || searchLoading}
                    className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-45 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]">
                    {searchLoading ? '搜索中…' : '搜索'}
                  </button>
                  <button type="button" onClick={() => setSearchOpen(false)}
                    className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-[var(--dark-text)]">
                    <X size={14} />
                  </button>
                </div>

                {/* 结果列表 */}
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {searchError && (
                    <p className="px-4 py-3 text-xs text-slate-400 dark:text-[var(--dark-muted)]">{searchError}</p>
                  )}
                  {!searchError && searchResults.length === 0 && !searchLoading && searchQuery && (
                    <p className="px-4 py-3 text-xs text-slate-400 dark:text-[var(--dark-muted)]">输入关键词后按 Enter 搜索</p>
                  )}
                  {searchResults.map((item) => {
                    const isCurrent = item.pageNumber === currentPage;
                    return (
                      <button
                        key={item.pageNumber}
                        type="button"
                        onClick={() => handleGoToPage(item.pageNumber)}
                        className={`flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors last:border-0 dark:border-[var(--dark-border)] ${
                          isCurrent
                            ? 'border-slate-100 bg-slate-100 dark:bg-[var(--dark-surface)]'
                            : 'border-slate-50 hover:bg-slate-50 dark:hover:bg-[var(--dark-surface)]'
                        }`}
                      >
                        <span className={`text-xs font-medium ${isCurrent ? 'text-slate-900 dark:text-[var(--dark-text)]' : 'text-slate-700 dark:text-[var(--dark-text)]'}`}>
                          {isCurrent && <span className="mr-1 text-slate-400">▶</span>}第 {item.pageNumber} 页
                        </span>
                        <span className="text-xs leading-relaxed text-slate-500 dark:text-[var(--dark-muted)]">{item.snippet}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <CourseSidebar open={sidebarOpen} activeSessionId={sessionId} />
      </div>

      {switchingSession && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div className="h-0.5 w-full overflow-hidden bg-transparent">
            <div className="h-full w-1/3 animate-[pulse_1.2s_ease-in-out_infinite] bg-slate-400/70 dark:bg-slate-300/50" />
          </div>
          <div className="absolute right-4 top-14 rounded-lg border border-slate-200 bg-white/88 px-2.5 py-1 text-xs text-slate-600 shadow-sm backdrop-blur-sm dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)]/80 dark:text-[var(--dark-muted)]">
            正在切换会话...
          </div>
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showSettings && (
        <SettingsModal
          bubbleStyle={bubbleStyle}
          onBubbleStyleChange={setBubbleStyle}
          onClose={() => setShowSettings(false)}
          isAdmin={meQuery.data?.role === 'admin'}
          onGoAdmin={handleGoAdminFromSettings}
        />
      )}
      <AnnouncementModal />
      <ReminderCat />
    </main>
  );
}
