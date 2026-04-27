import { useEffect, useState } from 'react';

export type BubbleStyle = 'glass' | 'classic';

const KEY = 'courselens:bubbleStyle';

export function useBubbleStyle() {
  const [bubbleStyle, setBubbleStyle] = useState<BubbleStyle>('glass');

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as BubbleStyle | null;
    if (saved === 'classic' || saved === 'glass') setBubbleStyle(saved);
  }, []);

  const setBubbleStyleAndSave = (style: BubbleStyle) => {
    setBubbleStyle(style);
    localStorage.setItem(KEY, style);
  };

  return { bubbleStyle, setBubbleStyle: setBubbleStyleAndSave };
}
