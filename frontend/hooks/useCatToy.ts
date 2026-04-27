import { useCallback, useRef, useState } from 'react';

export type CatState = 'idle' | 'hit' | 'combo';

const HIT_DURATION_MS = 80;
const COMBO_THRESHOLD = 15;
const COMBO_RESET_MS = 800;

export function useCatToy(onCombo?: () => void) {
  const [state, setState] = useState<CatState>('idle');
  const [rotation, setRotation] = useState(0);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboCountRef = useRef(0);
  const comboResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    if (comboResetTimerRef.current) clearTimeout(comboResetTimerRef.current);

    comboCountRef.current += 1;
    const isCombo = comboCountRef.current >= COMBO_THRESHOLD;

    const sign = Math.random() < 0.5 ? 1 : -1;
    const deg = sign * (3 + Math.random() * 4);
    setRotation(deg);
    setState(isCombo ? 'combo' : 'hit');

    if (isCombo) {
      onCombo?.();
      comboCountRef.current = 0;
    }

    hitTimerRef.current = setTimeout(() => {
      setState('idle');
      setRotation(0);
    }, isCombo ? 300 : HIT_DURATION_MS);

    comboResetTimerRef.current = setTimeout(() => {
      comboCountRef.current = 0;
    }, COMBO_RESET_MS);
  }, [onCombo]);

  return { state, rotation, handleClick };
}
