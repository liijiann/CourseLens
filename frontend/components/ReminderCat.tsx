import { useCallback, useEffect, useRef, useState } from 'react';
import PixelCat from '@/components/PixelCat';

const INTERVAL_MS = 15 * 60 * 1000;
const DISPLAY_MS = 5_000;
const LS_KEY = 'courselens:lastReminder';

const MESSAGES = [
  '喝点水吧',
  '眨眨眼，看看远处',
  '起来活动一下',
  '休息一会儿吧',
  '记得喝水哦',
  '伸个懒腰吧',
];

let msgIndex = 0;

interface Heart {
  id: number;
  angle: number;
}
let heartId = 0;

export default function ReminderCat() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [message, setMessage] = useState('');
  const [hearts, setHearts] = useState<Heart[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartsCleanupTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismiss = useCallback(() => {
    if (fadeTimer.current) return; // already dismissing
    // spawn hearts
    const newHearts: Heart[] = Array.from({ length: 6 }, (_, i) => ({
      id: heartId++,
      angle: (360 / 6) * i + Math.random() * 20 - 10,
    }));
    setHearts((prev) => [...prev, ...newHearts]);
    const cleanupTimer = setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !newHearts.find((n) => n.id === h.id)));
      heartsCleanupTimers.current = heartsCleanupTimers.current.filter((timer) => timer !== cleanupTimer);
    }, 700);
    heartsCleanupTimers.current.push(cleanupTimer);

    startFade();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startFade = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setFading(true);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      setVisible(false);
      setFading(false);
      fadeTimer.current = null;
      localStorage.setItem(LS_KEY, String(Date.now()));
    }, 400);
  }, []);

  const show = useCallback(() => {
    setMessage(MESSAGES[msgIndex % MESSAGES.length]);
    msgIndex++;
    setFading(false);
    setVisible(true);

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      startFade();
    }, DISPLAY_MS);
  }, [startFade]);

  useEffect(() => {
    const last = Number(localStorage.getItem(LS_KEY) ?? 0);
    const elapsed = Date.now() - last;
    const firstDelay = elapsed >= INTERVAL_MS ? 1000 : INTERVAL_MS - elapsed;

    let interval: ReturnType<typeof setInterval> | null = null;
    const firstTimer = setTimeout(() => {
      show();
      interval = setInterval(show, INTERVAL_MS);
    }, firstDelay);

    return () => {
      clearTimeout(firstTimer);
      if (interval) clearInterval(interval);
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      if (fadeTimer.current) {
        clearTimeout(fadeTimer.current);
        fadeTimer.current = null;
      }
      for (const timer of heartsCleanupTimers.current) {
        clearTimeout(timer);
      }
      heartsCleanupTimers.current = [];
    };
  }, [show]);

  if (!visible) return null;

  return (
    <div
      className={fading ? 'reminder-cat-fadeout' : 'reminder-cat-fadein'}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 40,
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
      onClick={dismiss}
    >
      {/* Hearts */}
      {hearts.map((h) => {
        const rad = (h.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * 45;
        const ty = Math.sin(rad) * 45;
        return (
          <span
            key={h.id}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              fontSize: 13,
              lineHeight: 1,
              pointerEvents: 'none',
              animation: 'cat-heart 650ms ease-out forwards',
              ['--tx' as string]: `${tx}px`,
              ['--ty' as string]: `${ty}px`,
            }}
          >
            ❤
          </span>
        );
      })}

      {/* Bubble */}
      <div
        style={{
          marginBottom: 8,
          background: 'var(--reminder-bubble-bg, #fff)',
          border: '1px solid var(--reminder-bubble-border, #e2e8f0)',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 12,
          color: 'var(--reminder-bubble-text, #475569)',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          position: 'relative',
        }}
      >
        {message}
        {/* tail */}
        <span
          style={{
            position: 'absolute',
            bottom: -6,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid var(--reminder-bubble-bg, #fff)',
          }}
        />
      </div>

      {/* Cat */}
      <div className="cat-breathe">
        <PixelCat />
      </div>
    </div>
  );
}
