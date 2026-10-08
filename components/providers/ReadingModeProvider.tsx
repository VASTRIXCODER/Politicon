'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
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
  // Set once the user picks a mode, so a slower server read can't undo their choice.
  const dirty = useRef(false);

  // Hydrate: localStorage first (instant), then Supabase (source of truth across
  // devices) — again whenever a different user signs in.
  useEffect(() => {
    let cancelled = false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'simple' || stored === 'expert') setModeState(stored);
    } catch { /* ignore */ }

    let supabase: ReturnType<typeof createClient>;
    try { supabase = createClient(); } catch { setReady(true); return; }

    async function loadFor(userId: string | null) {
      if (!userId) { if (!cancelled) setReady(true); return; }
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('reading_mode')
          .eq('id', userId)
          .maybeSingle();
        if (!cancelled && !dirty.current && (data?.reading_mode === 'simple' || data?.reading_mode === 'expert')) {
          setModeState(data.reading_mode);
          try { localStorage.setItem(STORAGE_KEY, data.reading_mode); } catch { /* ignore */ }
        }
      } catch { /* keep the current mode */ }
      if (!cancelled) setReady(true);
    }

    let currentUser: string | null | undefined;
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUser = user?.id ?? null;
      loadFor(currentUser);
    }).catch(() => setReady(true));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user?.id ?? null;
      if (event === 'SIGNED_IN' && currentUser !== undefined && id !== currentUser) {
        currentUser = id;
        dirty.current = false;
        loadFor(id);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const setMode = useCallback((next: ReadingMode) => {
    dirty.current = true;
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
    // Persist to Supabase in the background so it follows the user across devices.
    // It still applies on this device if that fails.
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { error } = await supabase.from('user_profiles').update({ reading_mode: next }).eq('id', user.id);
        if (error) console.warn('Reading mode not synced:', error.message);
      } catch (e) {
        console.warn('Reading mode not synced:', e);
      }
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
