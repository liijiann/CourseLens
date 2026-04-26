import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFViewerProps {
  pdfUrl: string;
  pageNumber: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onGoToPage: (page: number) => void;
}

interface BoxSize {
  width: number;
  height: number;
}

interface SlotState {
  pageNumber: number;
  width: number;
  height: number;
  opacity: number; // 0 or 1
}

function PdfLoadingPlaceholder() {
  return (
    <div className="flex min-h-[320px] items-center justify-center px-6">
      <div className="w-full max-w-[420px] space-y-3">
        <div className="mx-auto h-3 w-32 animate-pulse rounded bg-slate-200 dark:bg-[var(--dark-surface-elev)]" />
        <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-[var(--dark-surface-elev)]" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200 dark:bg-[var(--dark-surface-elev)]" />
        <div className="h-3 w-10/12 animate-pulse rounded bg-slate-200 dark:bg-[var(--dark-surface-elev)]" />
      </div>
    </div>
  );
}

const DEFAULT_PAGE_RATIO = 1 / 1.4142;
const MIN_RENDER_WIDTH = 320;
const MIN_RENDER_HEIGHT = 220;
const CONTROLS_RESERVED_HEIGHT = 66;
const PREFETCH_DELAY_MS = 120;
const PREFETCH_RADIUS = 1;
const RESIZE_SETTLE_MS = 140;
const SIZE_EPSILON = 2;
const WHEEL_PAGE_THRESHOLD = 90;
const WHEEL_PAGE_COOLDOWN_MS = 180;
const FADE_MS = 120;

function computeNeighborPages(pageNumber: number, totalPages: number, radius: number): number[] {
  const pages: number[] = [];
  for (let delta = 1; delta <= radius; delta += 1) {
    const left = pageNumber - delta;
    const right = pageNumber + delta;
    if (left >= 1) pages.push(left);
    if (right <= totalPages) pages.push(right);
  }
  return pages;
}

function computeRenderSize(stageSize: BoxSize, pageRatio: number): BoxSize {
  const safeRatio = pageRatio > 0 ? pageRatio : DEFAULT_PAGE_RATIO;
  const maxWidth = Math.max(MIN_RENDER_WIDTH, stageSize.width - 16);
  const maxHeight = Math.max(MIN_RENDER_HEIGHT, stageSize.height - CONTROLS_RESERVED_HEIGHT);
  let width = maxWidth;
  let height = width / safeRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeRatio;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

export default function PDFViewer({
  pdfUrl,
  pageNumber,
  totalPages,
  onPrev,
  onNext,
  onGoToPage,
}: PDFViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  const [stageSize, setStageSize] = useState<BoxSize>({ width: 720, height: 720 });
  const [stableStageSize, setStableStageSize] = useState<BoxSize>({ width: 720, height: 720 });
  const [maxStageSize, setMaxStageSize] = useState<BoxSize>({ width: 720, height: 720 });
  const [pageRatio, setPageRatio] = useState(DEFAULT_PAGE_RATIO);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [prefetchPages, setPrefetchPages] = useState<number[]>([]);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [hasFirstPaint, setHasFirstPaint] = useState(false);
  const wheelDeltaRef = useRef(0);
  const wheelCooldownUntilRef = useRef(0);
  const hasFirstPaintRef = useRef(false);

  // ── Dual-slot state ──────────────────────────────────────────────────────────
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const activeSlotRef = useRef<'A' | 'B'>('A'); // ref for use inside effects/callbacks
  const [slotA, setSlotA] = useState<SlotState>({ pageNumber, width: 720, height: 720, opacity: 1 });
  const [slotB, setSlotB] = useState<SlotState>({ pageNumber, width: 720, height: 720, opacity: 0 });

  // Prevent stale onRenderSuccess from triggering a swap
  const pendingSwapRef = useRef<{ slot: 'A' | 'B'; pageNumber: number } | null>(null);

  // ── Stage resize ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const updateSize = (syncStable = false) => {
      const nextSize = { width: node.clientWidth, height: node.clientHeight };
      setStageSize((c) => (c.width === nextSize.width && c.height === nextSize.height ? c : nextSize));
      if (syncStable) {
        setStableStageSize((c) => (c.width === nextSize.width && c.height === nextSize.height ? c : nextSize));
        setMaxStageSize((c) => (c.width === nextSize.width && c.height === nextSize.height ? c : nextSize));
      }
    };
    updateSize(true);
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStableStageSize((c) => (c.width === stageSize.width && c.height === stageSize.height ? c : stageSize));
    }, RESIZE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [stageSize]);

  useEffect(() => {
    setMaxStageSize((c) => {
      const grewW = stableStageSize.width > c.width + SIZE_EPSILON;
      const grewH = stableStageSize.height > c.height + SIZE_EPSILON;
      if (!grewW && !grewH) return c;
      return { width: Math.max(c.width, stableStageSize.width), height: Math.max(c.height, stableStageSize.height) };
    });
  }, [stableStageSize]);

  const baseRenderSize = useMemo(() => computeRenderSize(maxStageSize, pageRatio), [maxStageSize, pageRatio]);

  // ── Page change → load into inactive slot ────────────────────────────────────
  useEffect(() => {
    const active = activeSlotRef.current;
    const inactive = active === 'A' ? 'B' : 'A';
    const setInactive = inactive === 'A' ? setSlotA : setSlotB;
    const setActive = inactive === 'A' ? setSlotB : setSlotA;
    const inactiveState = inactive === 'A' ? slotA : slotB;
    const alreadyPrepared =
      inactiveState.pageNumber === pageNumber
      && inactiveState.width === baseRenderSize.width
      && inactiveState.height === baseRenderSize.height;

    if (alreadyPrepared) {
      pendingSwapRef.current = null;
      setInactive((s) => ({ ...s, opacity: 1 }));
      setActive((s) => ({ ...s, opacity: 0 }));
      activeSlotRef.current = inactive;
      setActiveSlot(inactive);

      window.setTimeout(() => {
        setPrefetchPages(computeNeighborPages(pageNumber, numPages ?? totalPages, PREFETCH_RADIUS));
      }, PREFETCH_DELAY_MS + FADE_MS);
      return;
    }

    pendingSwapRef.current = { slot: inactive, pageNumber };
    setInactive({ pageNumber, width: baseRenderSize.width, height: baseRenderSize.height, opacity: 0 });
  }, [pageNumber, baseRenderSize.width, baseRenderSize.height]); // eslint-disable-line react-hooks/exhaustive-deps

  const updatePageRatio = useCallback((page: unknown): boolean => {
    const target = page as {
      getViewport?: (o: { scale: number }) => { width: number; height: number };
      originalWidth?: number; originalHeight?: number;
      width?: number; height?: number;
    };
    const vp = target.getViewport?.({ scale: 1 });
    const w = vp?.width ?? target.originalWidth ?? target.width;
    const h = vp?.height ?? target.originalHeight ?? target.height;
    if (!w || !h || h <= 0) return false;
    setPageRatio(w / h);
    return true;
  }, []);

  // Single render callback for both slots — checks pendingSwapRef to decide
  const handleRenderSuccess = useCallback((slot: 'A' | 'B', renderedPage: number, page: unknown) => {
    updatePageRatio(page);
    if (!hasFirstPaintRef.current) {
      hasFirstPaintRef.current = true;
      setHasFirstPaint(true);
    }
    const pending = pendingSwapRef.current;
    // Only swap if this slot is the one we're waiting on
    if (!pending || pending.slot !== slot || pending.pageNumber !== renderedPage) return;

    pendingSwapRef.current = null;
    const setInactive = slot === 'A' ? setSlotA : setSlotB;
    const setActive = slot === 'A' ? setSlotB : setSlotA;
    setInactive((s) => ({ ...s, opacity: 1 }));
    setActive((s) => ({ ...s, opacity: 0 }));
    activeSlotRef.current = slot;
    setActiveSlot(slot);

    window.setTimeout(() => {
      setPrefetchPages(computeNeighborPages(renderedPage, numPages ?? totalPages, PREFETCH_RADIUS));
    }, PREFETCH_DELAY_MS + FADE_MS);
  }, [updatePageRatio, numPages, totalPages]);

  const effectiveTotalPages = numPages ?? totalPages;

  const activeState = activeSlot === 'A' ? slotA : slotB;

  const visualScale = useMemo(() => {
    const maxW = Math.max(1, stageSize.width - 16);
    const maxH = Math.max(1, stageSize.height - CONTROLS_RESERVED_HEIGHT);
    return Math.max(0.1, Math.min(maxW / activeState.width, maxH / activeState.height));
  }, [stageSize, activeState.width, activeState.height]);

  const displaySize = useMemo(() => ({
    width: Math.max(1, Math.floor(activeState.width * visualScale)),
    height: Math.max(1, Math.floor(activeState.height * visualScale)),
  }), [activeState.width, activeState.height, visualScale]);

  // ── Keyboard navigation ───────────────────────────────────────────────────────
  const flipToPrevPage = useCallback(() => { if (pageNumber > 1) onPrev(); }, [onPrev, pageNumber]);
  const flipToNextPage = useCallback(() => { if (pageNumber < effectiveTotalPages) onNext(); }, [onNext, pageNumber, effectiveTotalPages]);

  useEffect(() => {
    const isEditable = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (isEditable(e.target)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipToPrevPage(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); flipToNextPage(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipToPrevPage, flipToNextPage]);

  // ── Wheel navigation ──────────────────────────────────────────────────────────
  const handleStageWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (editingPage) return;
    if (event.ctrlKey || event.metaKey) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    event.preventDefault();
    const now = Date.now();
    if (now < wheelCooldownUntilRef.current) return;
    wheelDeltaRef.current += delta;
    if (Math.abs(wheelDeltaRef.current) < WHEEL_PAGE_THRESHOLD) return;
    if (wheelDeltaRef.current > 0) flipToNextPage(); else flipToPrevPage();
    wheelDeltaRef.current = 0;
    wheelCooldownUntilRef.current = now + WHEEL_PAGE_COOLDOWN_MS;
  }, [editingPage, flipToNextPage, flipToPrevPage]);

  useEffect(() => {
    setSlotA({ pageNumber, width: 720, height: 720, opacity: 1 });
    setSlotB({ pageNumber, width: 720, height: 720, opacity: 0 });
    setActiveSlot('A');
    setNumPages(null);
    setPrefetchPages([]);
    hasFirstPaintRef.current = false;
    setHasFirstPaint(false);
    pendingSwapRef.current = null;
  }, [pdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingPage && editInputRef.current) editInputRef.current.select();
  }, [editingPage]);

  // ── Render helpers ────────────────────────────────────────────────────────────
  const renderSlot = (slot: 'A' | 'B', state: SlotState, isActive: boolean) => (
    <div
      key={slot}
      className="pdf-tone dark:bg-[var(--dark-bg)]"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: `-${state.height / 2}px`,
        marginLeft: `-${state.width / 2}px`,
        width: `${state.width}px`,
        height: `${state.height}px`,
        transform: `scale(${visualScale})`,
        willChange: 'transform, opacity',
        opacity: state.opacity,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: isActive ? 'auto' : 'none',
        zIndex: isActive ? 1 : 0,
      }}
    >
      <Document
        file={pdfUrl}
        onLoadSuccess={isActive ? (doc) => setNumPages(doc.numPages) : undefined}
        loading={isActive ? <PdfLoadingPlaceholder /> : null}
        error={null}
      >
        <Page
          pageNumber={state.pageNumber}
          width={state.width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={isActive ? <PdfLoadingPlaceholder /> : null}
          onRenderSuccess={(page) => handleRenderSuccess(slot, state.pageNumber, page)}
        />
      </Document>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={stageRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent dark:bg-[var(--dark-bg)]"
        onWheel={handleStageWheel}
      >
        <div className="flex min-h-full flex-col items-center justify-center py-4">
          <div
            className={`mx-auto overflow-hidden rounded-xl transition-[background-color,box-shadow] ${
              hasFirstPaint
                ? 'bg-white shadow-[0_2px_12px_rgba(15,23,42,0.10)] dark:bg-[var(--dark-surface)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.55)]'
                : 'bg-transparent shadow-none dark:bg-transparent'
            }`}
            style={{ width: `${displaySize.width}px`, minHeight: `${displaySize.height}px`, position: 'relative' }}
          >
            {renderSlot('A', slotA, activeSlot === 'A')}
            {renderSlot('B', slotB, activeSlot === 'B')}

            {/* Prefetch — hidden */}
            <div className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden opacity-0" aria-hidden="true">
              <Document file={pdfUrl}>
                {prefetchPages.map((p) => (
                  <Page key={p} pageNumber={p} width={activeState.width} renderTextLayer={false} renderAnnotationLayer={false} />
                ))}
              </Document>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 flex items-center justify-center gap-3 border-t border-slate-100 dark:border-[var(--dark-border)] py-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={pageNumber <= 1}
          className="rounded-full px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)] disabled:opacity-45"
        >
          上一页
        </button>

        {editingPage ? (
          <input
            ref={editInputRef}
            type="text"
            inputMode="numeric"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const next = Math.max(1, Math.min(effectiveTotalPages, Number(pageInput) || 1));
                onGoToPage(next);
                setEditingPage(false);
              }
              if (e.key === 'Escape') setEditingPage(false);
            }}
            onBlur={() => setEditingPage(false)}
            className="w-14 appearance-none rounded-full bg-transparent px-2 py-0.5 text-center text-xs text-slate-700 outline-none dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)]"
            min={1}
            max={effectiveTotalPages}
          />
        ) : (
          <span
            className="cursor-pointer text-xs text-slate-600 dark:text-[var(--dark-muted)] hover:text-accent"
            onClick={() => { setPageInput(String(pageNumber)); setEditingPage(true); }}
          >
            第 {pageNumber} / {effectiveTotalPages} 页
          </span>
        )}

        <button
          type="button"
          onClick={onNext}
          disabled={pageNumber >= effectiveTotalPages}
          className="rounded-full px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)] disabled:opacity-45"
        >
          下一页
        </button>
      </div>
    </div>
  );
}
