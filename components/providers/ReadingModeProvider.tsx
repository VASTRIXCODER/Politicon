'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ReadingMode } from '@/types';

interface ReadingModeContextValue {
  mode: ReadingMode;
  simple: boolean;
  setMode: (mode: ReadingMode) => void;
  toggle: () => void;
  ready: boolean;
}

const ReadingModeContext = createContext<ReadingModeContextValue>({
  mode: 'expert',
  simple: false,
  setMode: () => {},
  toggle: () => {},
  ready: false,
});

const STORAGE_KEY = 'politicon_reading_mode';

export function ReadingModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ReadingMode>('expert');
  const [ready, setReady] = useState(false);

  // Hydrate: localStorage first (instant), then Supabase (source of truth across devices)
  useEffect(() => {
    let cancelled = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'simple' || stored === 'expert') setModeState(stored);
    } catch { /* ignore */ }

    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (!cancelled) setReady(true); return; }
        const { data } = await supabase
          .from('user_profiles')
          .select('reading_mode')
          .eq('id', user.id)
          .single();
        if (!cancelled && (data?.reading_mode === 'simple' || data?.reading_mode === 'expert')) {
          setModeState(data.reading_mode);
          try { localStorage.setItem(STORAGE_KEY, data.reading_mode); } catch { /* ignore */ }
        }
      } catch { /* default expert */ }
      if (!cancelled) setReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  const setMode = useCallback((next: ReadingMode) => {
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    // Persist to Supabase in the background so it follows the user across devices.
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await supabase.from('user_profiles').update({ reading_mode: next }).eq('id', user.id);
      } catch { /* non-fatal */ }
    })();
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'simple' ? 'expert' : 'simple');
  }, [mode, setMode]);

  return (
    <ReadingModeContext.Provider value={{ mode, simple: mode === 'simple', setMode, toggle, ready }}>
      {children}
    </ReadingModeContext.Provider>
  );
}

export function useReadingMode() {
  return useContext(ReadingModeContext);
}
