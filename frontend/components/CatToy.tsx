import { useCallback, useEffect, useRef, useState } from 'react';
import PixelCat from '@/components/PixelCat';
import { useCatToy } from '@/hooks/useCatToy';

const HEART_COUNT = 8;
const HEART_CHARS = ['❤️', '🩷', '🧡', '💛'];

interface Heart {
  id: number;
  char: string;
  angle: number; // degrees
  dist: number;  // px travel distance
}

let heartIdCounter = 0;

export default function CatToy() {
  const [hearts, setHearts] = useState<Heart[]>([]);

  const spawnHearts = useCallback(() => {
    const newHearts: Heart[] = Array.from({ length: HEART_COUNT }, (_, i) => ({
      id: heartIdCounter++,
      char: HEART_CHARS[Math.floor(Math.random() * HEART_CHARS.length)],
      angle: (360 / HEART_COUNT) * i + Math.random() * 20 - 10,
      dist: 40 + Math.random() * 30,
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.find((n) => n.id === h.id)));
    }, 700);
  }, []);

  const { state, rotation, handleClick } = useCatToy(spawnHearts);

  // Position state
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);
  const suppressClick = useRef(false);
  const dragStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    didDrag.current = false;
    suppressClick.current = false;

    const el = elRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const cur = posRef.current;
    const startX = cur?.x ?? (window.innerWidth - rect.width - 20);
    const startY = cur?.y ?? (window.innerHeight - rect.height - 20);

    dragStart.current = { px: e.clientX, py: e.clientY, ox: startX, oy: startY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.px;
    const dy = e.clientY - dragStart.current.py;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;

    didDrag.current = true;
    const el = elRef.current;
    const w = el?.offsetWidth ?? 60;
    const h = el?.offsetHeight ?? 60;
    const next = {
      x: Math.max(0, Math.min(window.innerWidth - w, dragStart.current.ox + dx)),
      y: Math.max(0, Math.min(window.innerHeight - h, dragStart.current.oy + dy)),
    };
    posRef.current = next;
    setPos(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (didDrag.current) {
      suppressClick.current = true;
    }
    dragStart.current = null;
  }, []);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    didDrag.current = false;
    suppressClick.current = false;
    dragStart.current = null;
  }, []);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClick.current || didDrag.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
      didDrag.current = false;
      return;
    }
    handleClick();
  }, [handleClick]);

  useEffect(() => {
    const onResize = () => {
      const el = elRef.current;
      if (!posRef.current) return;
      const w = el?.offsetWidth ?? 60;
      const h = el?.offsetHeight ?? 60;
      const next = {
        x: Math.max(0, Math.min(window.innerWidth - w, posRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - h, posRef.current.y)),
      };
      posRef.current = next;
      setPos(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const catTransform = (() => {
    if (state === 'hit') return `scale(0.82) rotate(${rotation}deg)`;
    if (state === 'combo') return `scale(0.75) rotate(${rotation}deg)`;
    return 'scale(1) rotate(0deg)';
  })();

  const catTransition = (() => {
    if (state === 'idle') return 'transform 80ms ease-out';
    if (state === 'combo') return 'transform 50ms ease-in';
    return 'transform 40ms ease-in';
  })();

  const posStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { position: 'fixed', bottom: 20, right: 20 };

  return (
    <div
      ref={elRef}
      style={{ ...posStyle, zIndex: 40, cursor: 'grab', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      {/* Hearts */}
      {hearts.map((h) => {
        const rad = (h.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * h.dist;
        const ty = Math.sin(rad) * h.dist;
        return (
          <span
            key={h.id}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              fontSize: 14,
              lineHeight: 1,
              pointerEvents: 'none',
              animation: `cat-heart 650ms ease-out forwards`,
              // Pass travel vector via CSS custom properties
              ['--tx' as string]: `${tx}px`,
              ['--ty' as string]: `${ty}px`,
            }}
          >
            {h.char}
          </span>
        );
      })}

      {/* Cat */}
      <div
        className={state === 'idle' ? 'cat-breathe' : ''}
        style={{
          transform: catTransform,
          transition: catTransition,
          transformOrigin: 'center center',
          willChange: 'transform',
        }}
      >
        <PixelCat />
      </div>
    </div>
  );
}
