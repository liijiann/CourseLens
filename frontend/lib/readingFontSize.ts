export type ReadingFontSize = 'small' | 'medium' | 'large';

export const READING_FONT_SIZE_STORAGE_KEY = 'courselens:readingFontSize';

const READING_FONT_SIZE_ORDER: ReadingFontSize[] = ['small', 'medium', 'large'];

export const READING_FONT_SIZE_LABEL: Record<ReadingFontSize, string> = {
  small: 'A-',
  medium: 'A',
  large: 'A+',
};

export function isReadingFontSize(value: string | null): value is ReadingFontSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function nextReadingFontSize(current: ReadingFontSize): ReadingFontSize {
  const currentIndex = READING_FONT_SIZE_ORDER.indexOf(current);
  const nextIndex = (currentIndex + 1) % READING_FONT_SIZE_ORDER.length;
  return READING_FONT_SIZE_ORDER[nextIndex];
}

export function markdownFontClass(fontSize: ReadingFontSize): string {
  if (fontSize === 'small') return 'reading-font-small';
  if (fontSize === 'large') return 'reading-font-large';
  return '';
}
