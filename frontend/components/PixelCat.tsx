import { useMemo } from 'react';

const CAT_IMAGES = [
  '/pixel-cat-1.svg',
  '/pixel-cat-2.svg',
  '/pixel-cat-3.svg',
  '/pixel-cat-4.svg',
  '/pixel-cat-5.svg',
  '/pixel-cat-6.svg',
  '/pixel-cat-7.svg',
  '/pixel-cat-8.svg',
  '/pixel-cat-9.svg',
];

export default function PixelCat() {
  const src = useMemo(() => {
    const idx = Math.floor(Math.random() * CAT_IMAGES.length);
    return CAT_IMAGES[idx];
  }, []);

  return (
    <img
      src={src}
      alt="pixel cat"
      style={{
        width: 'auto',
        height: 120,
        imageRendering: 'pixelated',
        display: 'block',
      }}
      draggable={false}
    />
  );
}
