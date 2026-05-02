import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, X } from 'lucide-react';

import MarkdownText from '@/components/MarkdownText';
import SendIcon from '@/components/SendIcon';
import { BubbleStyle } from '@/hooks/useBubbleStyle';
import { MODELS } from '@/lib/models';
import { markdownFontClass, ReadingFontSize } from '@/lib/readingFontSize';
import { ChatTurn } from '@/lib/types';

interface ChatBoxProps {
  chat: ChatTurn[];
  draftAnswer: string;
  input: string;
  images: string[];
  model: string;
  sending: boolean;
  clearingHistory: boolean;
  bubbleStyle: BubbleStyle;
  fontSize: ReadingFontSize;
  onInputChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onAddImages: (images: string[]) => void;
  onRemoveImage: (index: number) => void;
  onClearHistory: () => void;
  onSend: () => void;
}

const MAX_IMAGES = 3;
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

async function compressImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('图片读取失败'));
      img.src = objectUrl;
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法处理图片');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function ChatBox({
  chat,
  draftAnswer,
  input,
  images,
  model,
  sending,
  clearingHistory,
  bubbleStyle,
  fontSize,
  onInputChange,
  onModelChange,
  onAddImages,
  onRemoveImage,
  onClearHistory,
  onSend,
}: ChatBoxProps) {
  const glass = bubbleStyle === 'glass';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelMenuRef = useRef<HTMLDivElement | null>(null);
  const [imageError, setImageError] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

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
  const currentModelLabel = useMemo(
    () => MODELS.find((item) => item.value === model)?.label ?? model,
    [model],
  );

  useEffect(() => {
    if (!modelMenuOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!modelMenuRef.current) return;
      if (!modelMenuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModelMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modelMenuOpen]);

  const handlePickImages = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setImageError('');
    const remain = Math.max(0, MAX_IMAGES - images.length);
    if (remain <= 0) {
      setImageError(`最多上传 ${MAX_IMAGES} 张图片`);
      return;
    }

    const files = Array.from(fileList)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, remain);

    if (!files.length) {
      setImageError('仅支持图片文件');
      return;
    }

    try {
      const encoded = await Promise.all(files.map((file) => compressImageToDataUrl(file)));
      onAddImages(encoded);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : '图片处理失败');
    }
  }, [images.length, onAddImages]);

  const handlePasteImages = useCallback(async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const items = event.clipboardData?.items;
    if (!items || items.length === 0) return;

    const pastedFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (file) pastedFiles.push(file);
    }
    if (!pastedFiles.length) return;

    event.preventDefault();
    const dataTransfer = new DataTransfer();
    for (const file of pastedFiles) dataTransfer.items.add(file);
    await handlePickImages(dataTransfer.files);
  }, [handlePickImages]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white p-3 dark:bg-[var(--dark-surface)]">
      <div className={`mb-3 min-h-0 flex-1 ${chat.length === 0 && !draftAnswer ? 'flex items-center justify-center' : 'overflow-auto pr-1'}`}>
        {chat.length === 0 && !draftAnswer ? (
          <p className="text-lg font-normal">还没有追问记录</p>
        ) : null}

        <div className="space-y-3 pb-2">
          {chat.map((turn, index) => {
            const isUser = turn.role === 'user';
            return (
              <div key={`${turn.role}-${index}`} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <article className={`bubble-fade-in max-w-[94%] rounded-2xl px-4 py-3 ${isUser ? userBubble : aiBubble}`}>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-[var(--dark-muted)]">{isUser ? '追问' : '回答'}</p>
                  {isUser && turn.images && turn.images.length > 0 ? (
                    <div className="mb-2 grid grid-cols-3 gap-2">
                      {turn.images.map((image, imageIndex) => (
                        <img
                          key={`${index}-${imageIndex}`}
                          src={image}
                          alt={`用户上传图片 ${imageIndex + 1}`}
                          className="h-20 w-full rounded-lg border border-slate-200 object-cover dark:border-[var(--dark-border)]"
                        />
                      ))}
                    </div>
                  ) : null}
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
        {images.length > 0 ? (
          <div className="mb-2 grid grid-cols-3 gap-2">
            {images.map((image, index) => (
              <div key={`pending-image-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-[var(--dark-border)]">
                <img src={image} alt={`待发送图片 ${index + 1}`} className="h-20 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoveImage(index)}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white"
                  title="移除图片"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-0 rounded-xl border border-slate-200 bg-slate-50 transition-colors focus-within:border-slate-300 focus-within:bg-white dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface-elev)] dark:focus-within:bg-[var(--dark-surface)]">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || images.length >= MAX_IMAGES}
            className="ml-2 mb-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface)]"
            title="导入图片"
          >
            <ImagePlus size={16} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void handlePickImages(event.target.files);
              event.target.value = '';
            }}
          />
          <textarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="输入你的问题"
            rows={2}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 dark:text-[var(--dark-text)] dark:placeholder:text-[var(--dark-muted)]"
            onPaste={(event) => {
              void handlePasteImages(event);
            }}
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
              disabled={sending || (!input.trim() && images.length === 0)}
              className="send-btn inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-[var(--dark-button-bg)] dark:hover:bg-[var(--dark-button-hover)] dark:disabled:bg-[var(--dark-disabled)]"
              title="发送"
            >
              {sending
                ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                : <SendIcon />}
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-[11px] text-slate-400 dark:text-[var(--dark-muted)]">Enter 发送 · Shift+Enter 换行 · 最多 3 张图片</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <div ref={modelMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setModelMenuOpen((open) => !open)}
                disabled={sending}
                className="inline-flex h-7 max-w-[130px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface)]"
                title={currentModelLabel}
              >
                <span className="truncate">{currentModelLabel}</span>
                <ChevronDown
                  size={12}
                  className={`shrink-0 transition-transform duration-200 ${modelMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <div
                className={`absolute bottom-full right-0 z-20 mb-1 w-44 origin-bottom-right rounded-lg border border-slate-200 bg-white p-1 shadow-lg transition-all duration-150 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] ${
                  modelMenuOpen
                    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
                    : 'pointer-events-none translate-y-1 scale-95 opacity-0'
                }`}
              >
                {MODELS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => {
                      onModelChange(item.value);
                      setModelMenuOpen(false);
                    }}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-[11px] transition-colors ${
                      item.value === model
                        ? 'bg-slate-100 text-slate-700 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface-elev)]'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onClearHistory}
              disabled={sending || clearingHistory || (chat.length === 0 && !draftAnswer)}
              className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-[var(--dark-border)] dark:bg-[var(--dark-surface)] dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-surface)]"
            >
              {clearingHistory ? '清除中...' : '清除历史'}
            </button>
          </div>
        </div>

        {imageError ? <p className="mt-1 text-xs text-red-500">{imageError}</p> : null}
      </div>
    </div>
  );
}
