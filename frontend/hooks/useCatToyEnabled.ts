import { useEffect, useState } from 'react';

const KEY = 'courselens:catToy';

export function useCatToyEnabled() {
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem(KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(KEY, String(enabled));
  }, [enabled]);

  return { enabled, setEnabled };
}
