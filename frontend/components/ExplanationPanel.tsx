import { useRef, useMemo } from 'react';
import { Link2, RefreshCw } from 'lucide-react';

import MarkdownText from '@/components/MarkdownText';
import PixelCat from '@/components/PixelCat';
import SelectionAskButton from '@/components/SelectionAskButton';
import { BubbleStyle } from '@/hooks/useBubbleStyle';
import { markdownFontClass, ReadingFontSize } from '@/lib/readingFontSize';
import { ChatTurn, FrontendPageStatus } from '@/lib/types';

interface ExplanationPanelProps {
  sessionId: string;
  pageNumber: number;
  status: FrontendPageStatus;
  explanation: string;
  error: string;
  chat: ChatTurn[];
  draftAnswer: string;
  canAsk: boolean;
  askSending: boolean;
  bubbleStyle: BubbleStyle;
  fontSize: ReadingFontSize;
  onRetry: () => void;
  onRegenerate: () => void;
  onRegenerateWithContext: () => void;
  onQuickAsk: (message: string) => void;
  onAbort: () => void;
}

function splitExplanationBlocks(explanation: string): string[] {
  const normalized = explanation.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

export default function ExplanationPanel({
  sessionId,
  pageNumber,
  status,
  explanation,
  error,
  chat,
  draftAnswer,
  canAsk,
  askSending,
  bubbleStyle,
  fontSize,
  onRetry,
  onRegenerate,
  onRegenerateWithContext,
  onQuickAsk,
  onAbort,
}: ExplanationPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => splitExplanationBlocks(explanation), [explanation]);
  const hasBlocks = blocks.length > 0;
  const glass = bubbleStyle === 'glass';
  const blockBubble = glass
    ? 'border border-black/5 bg-white/60 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/5 dark:text-[var(--dark-text)]'
    : 'bg-gray-100 text-slate-800 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]';
  const loadingBubble = glass
    ? 'border border-black/5 bg-white/60 text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.08)] dark:border-white/8 dark:bg-white/5 dark:text-[var(--dark-muted)]'
    : 'bg-slate-50 text-slate-600 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-muted)]';
  const textClass = fontSize === 'small'
    ? 'text-xs leading-6'
    : fontSize === 'large'
      ? 'text-base leading-8'
      : 'text-sm leading-7';
  const markdownClass = markdownFontClass(fontSize);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[var(--dark-surface)] p-3">
      <div ref={containerRef} className="selection-highlight-host scrollbar-thin relative flex-1 overflow-auto">
        {status === 'error' ? (
          <div className="space-y-3">
            <p className={`${textClass} text-warn`}>生成失败：{error || '未知错误'}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg bg-gray-900 dark:bg-gray-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-800 dark:hover:bg-gray-600"
            >
              重试
            </button>
          </div>
        ) : hasBlocks ? (
          <div className="space-y-3 pb-2">
            {blocks.map((block, index) => (
              <article
                key={index}
                className={`bubble-fade-in max-w-[94%] rounded-2xl px-4 py-3 ${blockBubble}`}
              >
                <MarkdownText content={block} className={markdownClass} />
              </article>
            ))}
            {status === 'loading' && (
              <div className={`pl-1 ${textClass} text-gray-900 dark:text-gray-300`}>
                <span className="inline-block animate-pulse">▋</span>
              </div>
            )}
          </div>
        ) : status === 'loading' ? (
          <article className={`bubble-fade-in max-w-[94%] rounded-2xl px-4 py-3 ${textClass} ${loadingBubble}`}>
            正在生成解读...
            <span className="ml-1 inline-block animate-pulse text-gray-900 dark:text-gray-300">▋</span>
          </article>
        ) : (
          <div className="flex flex-col items-center justify-center pt-8">
            <PixelCat key={`${sessionId}-${pageNumber}`} />
          </div>
        )}
      </div>

      <SelectionAskButton
        containerRef={containerRef}
        pageNumber={pageNumber}
        canAsk={canAsk}
        chat={chat}
        draftAnswer={draftAnswer}
        askSending={askSending}
        bubbleStyle={bubbleStyle}
        fontSize={fontSize}
        onQuickAsk={onQuickAsk}
        onAbort={onAbort}
      />

      {status !== 'loading' && (
        <div className="flex shrink-0 gap-1 px-2 pb-1">
          <button
            type="button"
            onClick={onRegenerate}
            title="重新生成解读"
            className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            <RefreshCw size={11} />
            重新生成
          </button>
          <button
            type="button"
            onClick={onRegenerateWithContext}
            disabled={pageNumber <= 1}
            title={pageNumber <= 1 ? '第一页无上一页可串联' : '结合上一页内容重新生成'}
            className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-30 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)] dark:hover:text-[var(--dark-text)]"
          >
            <Link2 size={11} />
            串联上下文
          </button>
        </div>
      )}
    </div>
  );
}
