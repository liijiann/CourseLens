import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'warm';

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'warm');
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'warm') {
    root.classList.add('warm');
  }
}

export function useThemePreference() {
  const [theme, setTheme] = useState<Theme>('warm');

  useEffect(() => {
    const saved = (localStorage.getItem('courselens:theme') as Theme) || 'warm';
    const valid: Theme[] = ['light', 'dark', 'warm'];
    const resolved = valid.includes(saved) ? saved : 'warm';
    setTheme(resolved);
    applyTheme(resolved);
  }, []);

  const cycleTheme = () => {
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'warm' : 'light';
    setTheme(next);
    localStorage.setItem('courselens:theme', next);
    applyTheme(next);
  };

  return { theme, cycleTheme };
}
