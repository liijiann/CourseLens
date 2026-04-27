import MarkdownText from '@/components/MarkdownText';
import SendIcon from '@/components/SendIcon';
import { BubbleStyle } from '@/hooks/useBubbleStyle';
import { markdownFontClass, ReadingFontSize } from '@/lib/readingFontSize';
import { ChatTurn } from '@/lib/types';

interface ChatBoxProps {
  chat: ChatTurn[];
  draftAnswer: string;
  input: string;
  sending: boolean;
  bubbleStyle: BubbleStyle;
  fontSize: ReadingFontSize;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export default function ChatBox({
  chat,
  draftAnswer,
  input,
  sending,
  bubbleStyle,
  fontSize,
  onInputChange,
  onSend,
}: ChatBoxProps) {
  const glass = bubbleStyle === 'glass';
  const userBubble = glass
    ? 'border border-black/5 bg-white/70 text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-white/8 dark:bg-white/8 dark:text-[var(--dark-text)]'
    : 'bg-gradient-to-br from-[#ececf0] to-[#f6f6f8] dark:from-[var(--dark-surface-elev)] dark:to-[var(--dark-surface)] text-slate-700 dark:text-[var(--dark-text)]';
  const aiBubble = glass
    ? 'border border-black/5 bg-white/50 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur-md dark:border-white/8 dark:bg-white/5 dark:text-[var(--dark-text)]'
    : 'bg-slate-50 text-slate-800 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]';

  const textClass = fontSize === 'small'
    ? 'text-[13px] leading-6'
    : fontSize === 'large'
      ? 'text-base leading-8'
      : 'text-sm leading-7';
  const markdownClass = markdownFontClass(fontSize);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white p-3 dark:bg-[var(--dark-surface)]">
      <div className={`mb-3 min-h-0 flex-1 ${chat.length === 0 && !draftAnswer ? 'flex items-center justify-center' : 'overflow-auto pr-1'}`}>
        {chat.length === 0 && !draftAnswer ? (
          <p className="text-lg font-normal">还没有记录</p>
        ) : null}

        <div className="space-y-3 pb-2">
          {chat.map((turn, index) => {
            const isUser = turn.role === 'user';
            return (
              <div key={`${turn.role}-${index}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <article className={`bubble-fade-in max-w-[94%] rounded-2xl px-4 py-3 ${isUser ? userBubble : aiBubble}`}>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-[var(--dark-muted)]">{isUser ? '追问' : '回答'}</p>
                  {isUser ? (
                    <p className={`whitespace-pre-wrap ${textClass}`}>{turn.content}</p>
                  ) : (
                    <MarkdownText content={turn.content} className={markdownClass} />
                  )}
                </article>
              </div>
            );
          })}

          {draftAnswer ? (
            <div className="flex justify-start">
              <article className={`bubble-fade-in max-w-[94%] rounded-2xl px-4 py-3 ${aiBubble}`}>
                <p className="mb-1 text-[11px] text-slate-500 dark:text-[var(--dark-muted)]">回答</p>
                <p className={`whitespace-pre-wrap ${textClass}`}>{draftAnswer}</p>
                <span className="ml-1 inline-block animate-pulse text-accent">▋</span>
              </article>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 dark:border-[var(--dark-border)]">
        <div className="flex items-end gap-0 rounded-xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-slate-300 focus-within:bg-white dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:focus-within:bg-[var(--dark-surface)]">
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="输入你的问题"
            rows={2}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <div className="flex shrink-0 items-end pb-2 pr-2">
            <button
              type="button"
              onClick={onSend}
              disabled={sending || !input.trim()}
              className="send-btn inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)] dark:disabled:bg-[var(--dark-disabled)]"
              title="发送"
            >
              {sending
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                : <SendIcon />}
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-right text-[11px] text-slate-400 dark:text-[var(--dark-muted)]">Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  );
}
