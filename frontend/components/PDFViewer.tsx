import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
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

interface NormalizedPoint {
  x: number; // [0, 1]
  y: number; // [0, 1]
}

interface DrawStroke {
  points: NormalizedPoint[];
  color: string;
  widthRatio: number;
  type: 'pen' | 'highlighter' | 'eraser' | 'line';
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
const MIN_RENDER_WIDTH = 320;
const MIN_RENDER_HEIGHT = 220;
const DEFAULT_PAGE_RATIO = 1.414; // A4 aspect ratio (width/height)
const WHEEL_PAGE_THRESHOLD = 90;
const WHEEL_PAGE_COOLDOWN_MS = 180;
const SCROLL_EDGE_EPSILON = 2;
const DEFAULT_BRUSH_COLOR = '#0f172a';
const DEFAULT_BRUSH_SIZE: BrushSize = 'medium';
const DEFAULT_BRUSH_TYPE: BrushType = 'pen';
const BRUSH_SIZE_TO_PX: Record<BrushSize, number> = { fine: 1.8, medium: 2.8, thick: 4.2 };
const BRUSH_TYPE_OPTIONS: Array<{ value: BrushType; label: string }> = [
  { value: 'pen', label: '钢笔' },
  { value: 'highlighter', label: '荧光' },
  { value: 'line', label: '直线' },
  { value: 'eraser', label: '橡皮' },
];
const BRUSH_SIZE_OPTIONS: Array<{ value: BrushSize; label: string }> = [
  { value: 'fine', label: '细' },
  { value: 'medium', label: '中' },
  { value: 'thick', label: '粗' },
];
const BRUSH_COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7'];

type BrushType = 'pen' | 'highlighter' | 'eraser' | 'line';
type BrushSize = 'fine' | 'medium' | 'thick';

function computeRenderWidth(containerWidth: number): number {
  return Math.max(MIN_RENDER_WIDTH, containerWidth - 16);
}

function PDFViewer({
  pdfUrl,
  pageNumber,
  totalPages,
  onPrev,
  onNext,
  onGoToPage,
}: PDFViewerProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [containerWidth, setContainerWidth] = useState(720);
  const [pageRatio, setPageRatio] = useState(DEFAULT_PAGE_RATIO);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [editingPage, setEditingPage] = useState(false);
  const [pageInput, setPageInput] = useState('');
  const [drawingMode, setDrawingMode] = useState(false);
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushType, setBrushType] = useState<BrushType>(DEFAULT_BRUSH_TYPE);
  const [brushSize, setBrushSize] = useState<BrushSize>(DEFAULT_BRUSH_SIZE);
  const [strokesByPage, setStrokesByPage] = useState<Record<number, DrawStroke[]>>({});
  // renderWidth is the actual pixel width used to render the PDF canvas.
  // It only grows (never shrinks) so the canvas is never re-rendered when the
  // container gets narrower (e.g. sidebar opens). CSS scale handles the visual fit.
  const [renderWidth, setRenderWidth] = useState(720);

  const wheelDeltaRef = useRef(0);
  const wheelCooldownUntilRef = useRef(0);
  const isDrawingRef = useRef(false);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const scrollDirectionRef = useRef<'top' | 'bottom' | null>(null);

  const effectiveTotalPages = numPages ?? totalPages;

  // Container resize — update containerWidth always; renderWidth only grows
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    let rafId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const w = node.clientWidth;
        setContainerWidth(w);
        setRenderWidth((prev) => {
          const next = computeRenderWidth(w);
          return next > prev ? next : prev;
        });
      });
    });
    const w = node.clientWidth;
    setContainerWidth(w);
    setRenderWidth(computeRenderWidth(w));
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const actualRenderWidth = useMemo(() => computeRenderWidth(containerWidth), [containerWidth]);
  // scale < 1 when sidebar is open (container narrower than renderWidth)
  const scale = renderWidth > 0 ? Math.min(1, actualRenderWidth / renderWidth) : 1;
  const renderHeight = useMemo(
    () => Math.max(MIN_RENDER_HEIGHT, renderWidth / (pageRatio > 0 ? pageRatio : DEFAULT_PAGE_RATIO)),
    [renderWidth, pageRatio],
  );
  // Visual height after CSS scale — used for layout placeholder
  const scaledHeight = renderHeight * scale;

  // Scroll to correct position after page change
  useEffect(() => {
    const intent = scrollDirectionRef.current;
    scrollDirectionRef.current = null;
    if (!stageRef.current) return;
    if (intent === 'bottom') {
      stageRef.current.scrollTop = stageRef.current.scrollHeight;
    } else {
      stageRef.current.scrollTop = 0;
    }
  }, [pageNumber]);

  // Reset on PDF change
  useEffect(() => {
    setNumPages(null);
    setStrokesByPage({});
    setDrawingMode(false);
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
  }, [pdfUrl]);

  useEffect(() => {
    if (editingPage && editInputRef.current) editInputRef.current.select();
  }, [editingPage]);

  // Page navigation
  const flipToPrev = useCallback(() => {
    if (pageNumber > 1) { scrollDirectionRef.current = 'bottom'; onPrev(); }
  }, [onPrev, pageNumber]);

  const flipToNext = useCallback(() => {
    if (pageNumber < effectiveTotalPages) { scrollDirectionRef.current = 'top'; onNext(); }
  }, [onNext, pageNumber, effectiveTotalPages]);

  // Keyboard navigation
  useEffect(() => {
    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (drawingMode && e.key === 'Escape') { e.preventDefault(); setDrawingMode(false); return; }
      if (drawingMode || isEditable(e.target)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipToPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); flipToNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawingMode, flipToPrev, flipToNext]);

  // Wheel navigation
  const handleStageWheel = useCallback((event: WheelEvent) => {
    if (drawingMode || editingPage || event.ctrlKey || event.metaKey) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (delta === 0) return;
    const container = stageRef.current;
    if (!container) return;
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    const atTop = container.scrollTop <= SCROLL_EDGE_EPSILON;
    const atBottom = container.scrollTop >= maxScrollTop - SCROLL_EDGE_EPSILON;
    const isDown = delta > 0;
    if ((isDown && !atBottom) || (!isDown && !atTop)) { wheelDeltaRef.current = 0; return; }
    if (event.cancelable) event.preventDefault();
    const now = Date.now();
    if (now < wheelCooldownUntilRef.current) return;
    if (wheelDeltaRef.current !== 0 && Math.sign(wheelDeltaRef.current) !== Math.sign(delta)) wheelDeltaRef.current = 0;
    wheelDeltaRef.current += delta;
    if (Math.abs(wheelDeltaRef.current) < WHEEL_PAGE_THRESHOLD) return;
    if (wheelDeltaRef.current > 0) flipToNext(); else flipToPrev();
    wheelDeltaRef.current = 0;
    wheelCooldownUntilRef.current = now + WHEEL_PAGE_COOLDOWN_MS;
  }, [drawingMode, editingPage, flipToNext, flipToPrev]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    node.addEventListener('wheel', handleStageWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleStageWheel);
  }, [handleStageWheel]);

  // Annotation canvas sizing
  const getBrushWidthRatio = useCallback((w: number, h: number, size: BrushSize, type: BrushType) => {
    const base = Math.max(1, Math.min(w, h));
    const typeFactor = type === 'highlighter' ? 2.8 : type === 'eraser' ? 3.2 : 1;
    return (BRUSH_SIZE_TO_PX[size] * typeFactor) / base;
  }, []);

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: DrawStroke, w: number, h: number) => {
    if (stroke.points.length === 0) return;
    const lineWidth = Math.max(1, stroke.widthRatio * Math.max(1, Math.min(w, h)));
    const first = stroke.points[0]!;
    const last = stroke.points[stroke.points.length - 1] ?? first;
    const prevComposite = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = stroke.type === 'highlighter' ? 'square' : 'round';
    ctx.setLineDash([]);
    if (stroke.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else if (stroke.type === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.24; ctx.strokeStyle = stroke.color;
    } else {
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.strokeStyle = stroke.color;
    }
    ctx.beginPath();
    ctx.moveTo(first.x * w, first.y * h);
    if (stroke.type === 'line') {
      ctx.lineTo(last.x * w, last.y * h);
    } else {
      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i]!;
        ctx.lineTo(pt.x * w, pt.y * h);
      }
    }
    if (stroke.points.length === 1 && stroke.type !== 'line') ctx.lineTo(first.x * w + 0.01, first.y * h + 0.01);
    ctx.stroke();
    ctx.globalCompositeOperation = prevComposite;
    ctx.globalAlpha = prevAlpha;
  }, []);

  const redrawAnnotationLayer = useCallback(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w <= 0 || h <= 0) return;
    ctx.clearRect(0, 0, w, h);
    for (const stroke of strokesByPage[pageNumber] ?? []) drawStroke(ctx, stroke, w, h);
    if (activeStrokeRef.current) drawStroke(ctx, activeStrokeRef.current, w, h);
  }, [drawStroke, pageNumber, strokesByPage]);

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${renderHeight}px`;
    canvas.width = Math.floor(renderWidth * dpr);
    canvas.height = Math.floor(renderHeight * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawAnnotationLayer();
  }, [renderWidth, renderHeight, redrawAnnotationLayer]);

  useEffect(() => { redrawAnnotationLayer(); }, [redrawAnnotationLayer]);
  useEffect(() => { activeStrokeRef.current = null; isDrawingRef.current = false; redrawAnnotationLayer(); }, [pageNumber, redrawAnnotationLayer]);
  useEffect(() => { if (!drawingMode) { activeStrokeRef.current = null; isDrawingRef.current = false; redrawAnnotationLayer(); } }, [drawingMode, redrawAnnotationLayer]);

  const getNormalizedPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>): NormalizedPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0)),
      y: Math.max(0, Math.min(1, rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0)),
    };
  }, []);

  const handleDrawPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: DrawStroke = {
      points: [getNormalizedPoint(event)],
      color: brushColor,
      widthRatio: getBrushWidthRatio(event.currentTarget.clientWidth, event.currentTarget.clientHeight, brushSize, brushType),
      type: brushType,
    };
    isDrawingRef.current = true;
    activeStrokeRef.current = stroke;
    redrawAnnotationLayer();
  }, [brushColor, brushSize, brushType, drawingMode, getBrushWidthRatio, getNormalizedPoint, redrawAnnotationLayer]);

  const handleDrawPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode || !isDrawingRef.current || !activeStrokeRef.current) return;
    const active = activeStrokeRef.current;
    const point = getNormalizedPoint(event);
    if (active.type === 'line') {
      if (active.points.length === 1) active.points.push(point); else active.points[1] = point;
    } else {
      active.points.push(point);
    }
    redrawAnnotationLayer();
  }, [drawingMode, getNormalizedPoint, redrawAnnotationLayer]);

  const finishCurrentStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.points.length === 0) { redrawAnnotationLayer(); return; }
    setStrokesByPage((current) => ({ ...current, [pageNumber]: [...(current[pageNumber] ?? []), stroke] }));
  }, [pageNumber, redrawAnnotationLayer]);

  const handleDrawPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingMode) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishCurrentStroke();
  }, [drawingMode, finishCurrentStroke]);

  const clearCurrentPageStrokes = useCallback(() => {
    setStrokesByPage((current) => {
      if (!current[pageNumber]?.length) return current;
      const next = { ...current };
      delete next[pageNumber];
      return next;
    });
    activeStrokeRef.current = null;
    isDrawingRef.current = false;
  }, [pageNumber]);

  const hasCurrentPageStrokes = (strokesByPage[pageNumber]?.length ?? 0) > 0;

  const eraserCursor = (() => {
    const r = Math.round(BRUSH_SIZE_TO_PX[brushSize] * 3.2);
    const size = (r + 2) * 2;
    const c = r + 2;
    const svg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'%3E%3Ccircle cx='${c}' cy='${c}' r='${r}' fill='none' stroke='%23475569' stroke-width='1.5'/%3E%3C/svg%3E`;
    return `url("data:image/svg+xml,${svg}") ${c} ${c}, cell`;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={stageRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-transparent dark:bg-[var(--dark-bg)]"
      >
        <div className="flex min-h-full flex-col items-center justify-center py-4">
          {/* Outer wrapper clips to the visible (scaled) width so centering works */}
          <div style={{ width: `${actualRenderWidth}px`, minHeight: `${scaledHeight}px` }}>
          <div
            className="pdf-tone overflow-visible rounded-xl shadow-[0_2px_12px_rgba(15,23,42,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
            style={{
              width: `${renderWidth}px`,
              minHeight: `${renderHeight}px`,
              position: 'relative',
              transform: scale < 1 ? `scale(${scale})` : undefined,
              transformOrigin: 'top left',
            }}
          >
            {/* PDF 层：渲染完后叠在骨架屏（容器背景色）上方 */}
            <div className="relative z-10">
              <Document
                file={pdfUrl}
                onLoadSuccess={(doc) => setNumPages(doc.numPages)}
                loading={null}
                error={null}
              >
                <div key={pageNumber} className="pdf-page-fadein">
                  <Page
                    pageNumber={pageNumber}
                    width={renderWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={null}
                    onRenderSuccess={(page) => {
                      const vp = (page as any).getViewport?.({ scale: 1 });
                      const w = vp?.width ?? (page as any).originalWidth;
                      const h = vp?.height ?? (page as any).originalHeight;
                      if (w && h && h > 0) setPageRatio(w / h);
                    }}
                  />
                </div>
              </Document>

              <canvas
                ref={annotationCanvasRef}
                className="absolute inset-0"
                style={{
                  width: '100%', height: '100%', zIndex: 2,
                  pointerEvents: drawingMode ? 'auto' : 'none',
                  cursor: !drawingMode ? 'default' : brushType === 'eraser' ? eraserCursor
                    : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='2' fill='%23475569'/%3E%3C/svg%3E") 8 8, crosshair`,
                  touchAction: drawingMode ? 'none' : 'auto',
                }}
                onPointerDown={handleDrawPointerDown}
                onPointerMove={handleDrawPointerMove}
                onPointerUp={handleDrawPointerUp}
                onPointerCancel={handleDrawPointerUp}
                onPointerLeave={() => { if (drawingMode) finishCurrentStroke(); }}
              />
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 py-2 dark:border-[var(--dark-border)]">
        <div className="flex flex-wrap items-center justify-center gap-3 px-3">
          <button type="button" onClick={flipToPrev} disabled={pageNumber <= 1}
            className="rounded-full px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)] disabled:opacity-45">
            上一页
          </button>

          {editingPage ? (
            <input ref={editInputRef} type="text" inputMode="numeric" value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { onGoToPage(Math.max(1, Math.min(effectiveTotalPages, Number(pageInput) || 1))); setEditingPage(false); }
                if (e.key === 'Escape') setEditingPage(false);
              }}
              onBlur={() => setEditingPage(false)}
              className="w-14 appearance-none rounded-full bg-transparent px-2 py-0.5 text-center text-xs text-slate-700 outline-none dark:text-[var(--dark-text)]"
              min={1} max={effectiveTotalPages}
            />
          ) : (
            <span className="cursor-pointer text-xs text-slate-600 dark:text-[var(--dark-muted)]"
              onClick={() => { setPageInput(String(pageNumber)); setEditingPage(true); }}>
              第 {pageNumber} / {effectiveTotalPages} 页
            </span>
          )}

          <button type="button" onClick={flipToNext} disabled={pageNumber >= effectiveTotalPages}
            className="rounded-full px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)] disabled:opacity-45">
            下一页
          </button>

          <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-[var(--dark-border)]" aria-hidden="true" />

          <button type="button" onClick={() => setDrawingMode((v) => !v)} title={drawingMode ? '退出画笔' : '画笔'}
            className={`rounded-full p-1.5 transition-colors ${drawingMode
              ? 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
              : 'text-slate-700 hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)]'}`}>
            <Pencil size={14} />
          </button>

          <button type="button" onClick={clearCurrentPageStrokes} disabled={!hasCurrentPageStrokes}
            className="rounded-full px-2.5 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:text-[var(--dark-text)] dark:hover:bg-[var(--dark-surface)] disabled:opacity-45">
            清空本页
          </button>
        </div>

        {drawingMode && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 px-3">
            <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 dark:bg-[var(--dark-surface)]">
              {BRUSH_TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setBrushType(opt.value)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${brushType === opt.value
                    ? 'bg-slate-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                    : 'text-slate-600 hover:bg-slate-200 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-bg)]'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2 py-1 dark:bg-[var(--dark-surface)]">
              {BRUSH_SIZE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button" onClick={() => setBrushSize(opt.value)}
                  className={`rounded-full px-2 py-0.5 text-xs transition-colors ${brushSize === opt.value
                    ? 'bg-slate-900 text-white dark:bg-[var(--dark-surface-elev)] dark:text-[var(--dark-text)]'
                    : 'text-slate-600 hover:bg-slate-200 dark:text-[var(--dark-muted)] dark:hover:bg-[var(--dark-bg)]'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 dark:bg-[var(--dark-surface)]">
              {BRUSH_COLORS.map((color) => (
                <button key={color} type="button" onClick={() => setBrushColor(color)}
                  className={`h-5 w-5 rounded-full border transition-transform ${brushColor === color
                    ? 'scale-110 border-slate-700 dark:border-[var(--dark-text)]'
                    : 'border-slate-300 dark:border-[var(--dark-border)]'}`}
                  style={{ backgroundColor: color }} aria-label={`画笔颜色 ${color}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PDFViewer);
