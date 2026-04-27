import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Flame, LayoutList, Moon, Settings, Sun } from 'lucide-react';

import ChatBox from '@/components/ChatBox';
import { CourseSidebar } from '@/components/CourseSidebar';
import ExplanationPanel from '@/components/ExplanationPanel';
import PDFViewer from '@/components/PDFViewer';
import ReminderCat from '@/components/ReminderCat';
import { SettingsModal } from '@/components/SettingsModal';
import { UploadModal } from '@/components/UploadModal';
import { useChatStream } from '@/hooks/useChatStream';
import { useExplainStream } from '@/hooks/useExplainStream';
import { EMPTY_PAGE_STATE, useSessionState } from '@/hooks/useSessionState';
import { useBubbleStyle } from '@/hooks/useBubbleStyle';
import { Theme, useThemePreference } from '@/hooks/useThemePreference';
import { getPdfUrl } from '@/lib/api';
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

  const { theme, cycleTheme } = useThemePreference();
  const { bubbleStyle, setBubbleStyle } = useBubbleStyle();
  const {
    session,
    loadingSession,
    sessionError,
    currentPage,
    setCurrentPage,
    pages,
    pagesRef,
    updatePage,
  } = useSessionState(sessionId);

  const [activeTab, setActiveTab] = useState<'explain' | 'chat'>('explain');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    chatSending,
    chatDraftAnswer,
    sendChat,
    sendChatMessage,
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

  useEffect(() => {
    setActiveTab('explain');
  }, [currentPage]);

  const pdfUrl = useMemo(() => getPdfUrl(sessionId), [sessionId]);

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
    <main className="flex h-screen flex-col overflow-hidden bg-white dark:bg-[var(--dark-bg)]">
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
            onClick={() => setShowUpload(true)}
            title="上传新 PDF"
            className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-black dark:border dark:border-white/15 dark:bg-transparent dark:text-slate-400 dark:hover:border-white/25 dark:hover:text-white"
          >
            上传
          </button>
          <button
            onClick={() => setSidebarOpen((v) => !v)}
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
              pdfUrl={pdfUrl}
              pageNumber={currentPage}
              totalPages={session.totalPages}
              onPrev={handlePrev}
              onNext={handleNext}
              onGoToPage={handleGoToPage}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden" style={{ width: '35%' }}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 pt-2 dark:border-[var(--dark-border)]">
              <div className="flex gap-1 segmented-control">
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
                title="Switch font size"
              >
                {READING_FONT_SIZE_LABEL[readingFontSize]}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              {activeTab === 'chat' ? (
                <ChatBox
                  chat={currentState.chat}
                  draftAnswer={chatDraftAnswer}
                  input={chatInput}
                  sending={chatSending}
                  onInputChange={setChatInput}
                  onSend={sendChat}
                  bubbleStyle={bubbleStyle}
                  fontSize={readingFontSize}
                />
              ) : (
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
              )}
            </div>
          </div>
        </section>

        <CourseSidebar open={sidebarOpen} activeSessionId={sessionId} />
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showSettings && <SettingsModal bubbleStyle={bubbleStyle} onBubbleStyleChange={setBubbleStyle} onClose={() => setShowSettings(false)} />}
      <ReminderCat />
    </main>
  );
}
