'use client';

import { useSyncExternalStore } from 'react';

/**
 * Optional interface sounds, off by default.
 *
 * This module is the preference (an external store every toggle shares) and
 * playCue. The synthesizer (lib/soundSynth: WebAudio oscillators and a
 * shared noise buffer, no audio files) loads only once sound is on: when the
 * visitor turns it on, or on a page opened with it already on. So no page's
 * first load carries it. Nothing autoplays: the AudioContext is created in
 * the click that turns sound on (or on the first cue, on a page opened with
 * it on) and only started once the person has interacted with the page.
 * Sound never carries meaning on its own: every cue accompanies something
 * visible.
 *
 *   playCue('chime');                    // no-op unless sound is on
 *   const [on, setOn] = useSoundEnabled();
 */

export type Cue = 'rustle' | 'chime' | 'whoosh' | 'tick';

export const SOUND_STORAGE_KEY = 'pc-sound';

/** The stored preference → on/off. Anything but an explicit "on" is off. */
export function parseSoundPreference(value: unknown): boolean {
  return value === 'on';
}

/* ── The synthesizer, loaded once sound is on ── */

type Synth = typeof import('@/lib/soundSynth');
let synth: Synth | null = null;
let loading: Promise<Synth | null> | null = null;
/**
 * The AudioContext made inside the click that turned sound on, while the
 * synthesizer was still on its way (it takes the context over when it
 * arrives). WebKit starts audio only within the person's own gesture, and
 * the chime that confirms the choice has to wait for the chunk.
 */
let unlocked: AudioContext | null = null;

/**
 * Loads the synthesizer (once). Resolves null if its chunk can't load (the
 * next cue tries again): sound is an extra, so a failure stays silent.
 */
export function loadSynth(): Promise<Synth | null> {
  loading ??= import('@/lib/soundSynth').then(
    (m) => {
      if (unlocked) m.adopt(unlocked);
      unlocked = null;
      return (synth = m);
    },
    () => {
      loading = null;
      return null;
    }
  );
  return loading;
}

/* ── Preference (an external store, so every toggle on the page agrees) ── */

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function readEnabled(): boolean {
  if (cached === null) {
    try {
      cached = parseSoundPreference(localStorage.getItem(SOUND_STORAGE_KEY));
    } catch {
      // No storage (private mode, blocked site data): off.
      cached = false;
    }
  }
  return cached;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Opened with sound on: have the synthesizer ready for the first cue.
  if (readEnabled()) void loadSynth();
  // Another tab turned sound on or off.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== SOUND_STORAGE_KEY) return;
    cached = null;
    if (readEnabled()) void loadSynth();
    else synth?.quiet();
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Whether sound is on right now (for code outside React). Always false on the server. */
export function isSoundEnabled(): boolean {
  return typeof window !== 'undefined' && readEnabled();
}

/**
 * Turns sound on or off and saves the choice. Call it from the user's own
 * click or key press: turning sound on starts the audio there and then,
 * which is what lets every browser play the chime that confirms it.
 */
export function setSoundEnabled(on: boolean) {
  cached = on;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  if (on && synth) {
    synth.wake();
  } else if (on) {
    try {
      unlocked ??= new window.AudioContext();
      void unlocked.resume().catch(() => undefined);
    } catch {
      // No (unprefixed) WebAudio here: the synthesizer makes its own context on a later cue, if it can.
    }
    void loadSynth();
  } else {
    synth?.quiet();
    // Turned off before the synthesizer arrived: the context made for it rests as well.
    void unlocked?.suspend().catch(() => undefined);
  }
  listeners.forEach((l) => l());
}

/**
 * The sound preference and a setter. The server render and the first client
 * render say off; it updates right after hydration.
 */
export function useSoundEnabled(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, readEnabled, () => false);
  return [on, setSoundEnabled];
}

/**
 * Plays a cue if sound is on; otherwise does nothing. Safe to call anywhere
 * (on the server, before hydration, in a hidden tab, without WebAudio).
 * Call it for deliberate actions only, never on hover or on a timer. The
 * very first cue may wait for the synthesizer's chunk (it's loaded ahead
 * whenever sound is on, so it's normally there already), and is dropped if
 * sound was turned off meanwhile.
 */
export function playCue(cue: Cue): void {
  if (typeof window === 'undefined' || !readEnabled()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (synth) synth.play(cue);
  else
    void loadSynth().then((s) => {
      if (readEnabled()) s?.play(cue);
    });
}
