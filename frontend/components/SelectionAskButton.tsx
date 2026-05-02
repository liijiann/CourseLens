import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { MessageCircle, X } from 'lucide-react';

import MarkdownText from '@/components/MarkdownText';
import SendIcon from '@/components/SendIcon';
import { BubbleStyle } from '@/hooks/useBubbleStyle';
import { markdownFontClass, ReadingFontSize } from '@/lib/readingFontSize';
import { ChatTurn } from '@/lib/types';

interface SelectionAskButtonProps {
  containerRef: React.RefObject<HTMLDivElement>;
  pageNumber: number;
  canAsk: boolean;
  chat: ChatTurn[];
  draftAnswer: string;
  askSending: boolean;
  bubbleStyle: BubbleStyle;
  fontSize: ReadingFontSize;
  onQuickAsk: (message: string) => void;
  onAbort: () => void;
}

interface Pos { x: number; y: number }

export default function SelectionAskButton({
  containerRef,
  pageNumber,
  canAsk,
  chat,
  draftAnswer,
  askSending,
  bubbleStyle,
  fontSize,
  onQuickAsk,
  onAbort,
}: SelectionAskButtonProps) {
  const glass = bubbleStyle === 'glass';
  const userBubble = glass
    ? 'border border-black/5 bg-white/70 text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-white/8 dark:bg-white/8 dark:text-[var(--dark-text)]'
    : 'bg-gradient-to-br from-[#ececf0] to-[#f6f6f8] dark:from-[var(--dark-surface-elev)] dark:to-[var(--dark-surface)] text-slate-700 dark:text-[var(--dark-text)]';
  const aiBubble = glass
    ? 'border border-black/5 bg-white/50 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur-md dark:border-white/8 dark:bg-white/5 dark:text-[var(--dark-text)]'
    : 'bg-slate-50 text-slate-800 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]';
  const textClass = fontSize === 'small'
    ? 'text-[13px] leading-6'
    : fontSize === 'large'
      ? 'text-base leading-8'
      : 'text-sm leading-7';
  const markdownClass = markdownFontClass(fontSize);
  const [btnPos, setBtnPos] = useState<Pos | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogPos, setDialogPos] = useState<Pos>({ x: 0, y: 0 });
  const [input, setInput] = useState('');
  const [autoFollow, setAutoFollow] = useState(true);

  // localChat: slice of global chat from when this dialog session opened
  const [localChat, setLocalChat] = useState<ChatTurn[]>([]);
  // isWaitingReply: true only after user sends from THIS dialog session
  const [isWaitingReply, setIsWaitingReply] = useState(false);

  const [inputFocused, setInputFocused] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef<Pos>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const selectedTextRef = useRef('');
  const refreshSelectionRafRef = useRef<number | null>(null);
  // snapshot of chat.length when dialog opened
  const chatBaseRef = useRef(0);

  // Reset on page change
  useEffect(() => {
    setBtnPos(null);
    setDialogOpen(false);
    setInput('');
    setLocalChat([]);
    setIsWaitingReply(false);
    setAutoFollow(true);
  }, [pageNumber]);

  const isNearBottom = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance < 24;
  }, []);

  // Keep bottom pinned only when user is already near bottom.
  // Use immediate scroll to avoid jitter during token streaming.
  useLayoutEffect(() => {
    if (!autoFollow) return;
    chatBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [autoFollow, localChat, isWaitingReply, draftAnswer]);

  // Sync global chat turns into localChat (problem 3 fix: no manual user push)
  useEffect(() => {
    if (!dialogOpen) return;
    const newTurns = chat.slice(chatBaseRef.current);
    setLocalChat(newTurns);
    // Once assistant reply lands, we're no longer waiting
    const lastTurn = newTurns[newTurns.length - 1];
    if (lastTurn?.role === 'assistant') {
      setIsWaitingReply(false);
    }
  }, [chat, dialogOpen]);

  const clearSelectionUi = useCallback(() => {
    setBtnPos(null);
  }, []);

  // Selection detection
  const handleSelectionChange = useCallback(() => {
    if (dialogOpen) {
      clearSelectionUi();
      return;
    }
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || !sel || sel.rangeCount === 0) {
      clearSelectionUi();
      return;
    }
    const container = containerRef.current;
    if (!container) {
      clearSelectionUi();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      clearSelectionUi();
      return;
    }
    const rect = range.getBoundingClientRect();
    selectedTextRef.current = text.replace(/[^\S\n]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    setBtnPos({ x: rect.left + rect.width / 2, y: rect.top });
  }, [clearSelectionUi, containerRef, dialogOpen]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const scheduleSelectionRefresh = useCallback(() => {
    if (refreshSelectionRafRef.current !== null) return;
    refreshSelectionRafRef.current = window.requestAnimationFrame(() => {
      refreshSelectionRafRef.current = null;
      handleSelectionChange();
    });
  }, [handleSelectionChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('scroll', scheduleSelectionRefresh, { passive: true });
    window.addEventListener('resize', scheduleSelectionRefresh);
    return () => {
      container.removeEventListener('scroll', scheduleSelectionRefresh);
      window.removeEventListener('resize', scheduleSelectionRefresh);
    };
  }, [containerRef, scheduleSelectionRefresh]);

  useEffect(() => () => {
    if (refreshSelectionRafRef.current !== null) {
      window.cancelAnimationFrame(refreshSelectionRafRef.current);
    }
  }, []);

  // Hide button on outside click
  useEffect(() => {
    if (dialogOpen) return;
    const hide = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('[data-selection-btn]')) return;
      setBtnPos(null);
    };
    document.addEventListener('mousedown', hide);
    return () => document.removeEventListener('mousedown', hide);
  }, [dialogOpen]);

  const openDialog = useCallback(() => {
    const text = selectedTextRef.current;
    setInput(text ? `我没理解这段话：“${text}”` : '');
    setLocalChat([]);
    setIsWaitingReply(false);
    chatBaseRef.current = chat.length;

    const x = Math.min((btnPos?.x ?? window.innerWidth / 2) - 180, window.innerWidth - 376);
    const y = Math.max((btnPos?.y ?? 100) - 320, 16);
    setDialogPos({ x: Math.max(8, x), y: Math.max(8, y) });
    setDialogOpen(true);
    setAutoFollow(true);
    setBtnPos(null);
    setInputFocused(false);
    window.getSelection()?.removeAllRanges();
  }, [btnPos, chat.length]);

  const closeDialog = useCallback(() => {
    // abort in-flight request on close
    if (askSending) onAbort();
    setDialogOpen(false);
    setInput('');
    setLocalChat([]);
    setIsWaitingReply(false);
    setAutoFollow(true);
  }, [askSending, onAbort]);

  const send = useCallback(() => {
    const msg = input.trim();
    if (!msg || askSending || !canAsk) return;
    setInput('');
    setIsWaitingReply(true);
    setAutoFollow(true);
    onQuickAsk(msg);
  }, [input, askSending, canAsk, onQuickAsk]);

  const handleChatScroll = useCallback(() => {
    const next = isNearBottom();
    setAutoFollow((prev) => (prev === next ? prev : next));
  }, [isNearBottom]);

  // Drag
  const onDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragOffset.current = { x: e.clientX - dialogPos.x, y: e.clientY - dialogPos.y };
    e.preventDefault();
  }, [dialogPos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      setDialogPos({
        x: Math.max(0, e.clientX - dragOffset.current.x),
        y: Math.max(0, e.clientY - dragOffset.current.y),
      });
    };
    const onUp = () => { isDragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  // only show draftAnswer when we're waiting for a reply from THIS session
  const visibleDraft = isWaitingReply ? draftAnswer : '';

  const portal = (
    <>
      {/* Floating selection button */}
      {btnPos && !dialogOpen && canAsk && (
        <button
          data-selection-btn
          type="button"
          onClick={openDialog}
          style={{ left: btnPos.x - 36, top: btnPos.y - 44, position: 'fixed' }}
          className="z-50 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.16)] dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-text)]"
          title="追问"
        >
          <span style={{ animation: 'scale-in 0.15s ease-out both', display: 'flex' }}>
            <MessageCircle size={13} className="text-slate-400 dark:text-[var(--dark-muted)]" />
          </span>
          <span style={{ animation: 'scale-in 0.18s ease-out both' }}>追问</span>
        </button>
      )}

      {dialogOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 49 }}
          onMouseDown={closeDialog}
        />
      )}

      {dialogOpen && (
        <div
          style={{ left: dialogPos.x, top: dialogPos.y, width: 360, position: 'fixed' }}
          className="z-50 flex flex-col rounded-2xl border border-white/60 bg-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-[var(--dark-surface)]/80"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Draggable title bar */}
          <div
            onMouseDown={onDragStart}
            className="flex cursor-grab items-center justify-between rounded-t-2xl border-b border-black/5 px-4 py-2.5 select-none active:cursor-grabbing dark:border-white/10"
          >
            <div className="flex items-center gap-1.5">
              <MessageCircle size={13} className="text-slate-400 dark:text-[var(--dark-muted)]" />
              <span className="text-xs font-medium text-slate-500 dark:text-[var(--dark-muted)]">追问</span>
            </div>
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]"
            >
              <X size={14} />
            </button>
          </div>

          {/* Chat history (this session only) */}
          {(localChat.length > 0 || visibleDraft) && (
            <div
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              className="scrollbar-thin max-h-56 overflow-y-auto space-y-2 px-3 py-2"
            >
              {localChat.map((turn, i) => {
                const isUser = turn.role === 'user';
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <article
                      className={`bubble-fade-in max-w-[90%] rounded-xl px-3 py-2 ${isUser ? userBubble : aiBubble}`}
                    >
                      {isUser
                        ? <p className={`whitespace-pre-wrap ${textClass}`}>{turn.content}</p>
                        : <MarkdownText content={turn.content} className={markdownClass} />}
                    </article>
                  </div>
                );
              })}
              {visibleDraft && (
                <div className="flex justify-start">
                  <article className={`bubble-fade-in max-w-[90%] rounded-xl px-3 py-2 ${aiBubble}`}>
                    <MarkdownText content={visibleDraft} className={markdownClass} />
                    <span className="ml-1 inline-block animate-pulse">▋</span>
                  </article>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="px-3 pb-3 pt-2">
            <div className="relative rounded-2xl border border-black/10 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition-colors focus-within:border-black/20 dark:border-slate-300 dark:bg-white">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入追问内容..."
                rows={inputFocused ? 2 : 1}
                className="no-scrollbar block w-full resize-none overflow-y-auto bg-transparent pb-9 pl-3.5 pr-12 pt-2.5 text-sm text-black outline-none placeholder:text-slate-500 transition-all duration-200 dark:text-black dark:placeholder:text-slate-500"
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 right-0 h-12 w-12 rounded-br-2xl bg-white dark:bg-white"
              />
              <div className="absolute bottom-2 right-2">
                <button
                  type="button"
                  disabled={askSending || !input.trim() || !canAsk}
                  onClick={send}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-[var(--dark-button-bg)] dark:disabled:bg-[var(--dark-disabled)] dark:hover:bg-[var(--dark-button-hover)]"
                  title="发送"
                >
                  {askSending
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    : <SendIcon />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return ReactDOM.createPortal(portal, document.body);
}
