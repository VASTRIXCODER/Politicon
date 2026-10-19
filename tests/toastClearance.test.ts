import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * useToastClearance (components/ui/Toast.tsx) without a browser: React's
 * useEffect runs the effect at once here, and the window, <html> and the
 * bar are stand-ins, so the test can move the bar and fire the page's events.
 */

const cleanups: (() => void)[] = [];
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  },
}));

const { TOAST_BOTTOM_INSET_VAR, useToastClearance } = await import('@/components/ui/Toast');

describe('useToastClearance', () => {
  let props: Map<string, string>;
  let listeners: Map<string, Set<() => void>>;
  let frames: Map<number, () => void>;
  let rect: { top: number; bottom: number; height: number };
  const bar = { current: { getBoundingClientRect: () => rect } as unknown as HTMLElement };
  const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((run) => run());
  };

  beforeEach(() => {
    props = new Map();
    listeners = new Map();
    frames = new Map();
    let nextFrame = 0;
    vi.stubGlobal('window', {
      innerHeight: 800,
      addEventListener: (type: string, listener: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
    });
    vi.stubGlobal('document', {
      documentElement: { style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) } },
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      frames.set(++nextFrame, run);
      return nextFrame;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
  });

  it('keeps no room for a bar in the upper half of the screen', () => {
    rect = { top: 300, bottom: 364, height: 64 };
    useToastClearance(bar);
    expect(props.has(TOAST_BOTTOM_INSET_VAR)).toBe(false);
  });

  it('lifts the toast above a bar along the bottom: its height, its offset from the edge and a gap', () => {
    rect = { top: 724, bottom: 788, height: 64 };
    useToastClearance(bar);
    expect(props.get(TOAST_BOTTOM_INSET_VAR)).toBe(`${64 + 12 + 8}px`);
  });

  it('follows a sticky bar that the page scrolls down to the bottom edge, and back', () => {
    // Turned sticky with the end of the form near the top: the bar sits in its own place, mid-screen.
    rect = { top: 300, bottom: 364, height: 64 };
    useToastClearance(bar);
    expect(props.has(TOAST_BOTTOM_INSET_VAR)).toBe(false);

    // Scrolled back up the page: the bar now rides the bottom edge. Measured once, on the next frame.
    rect = { top: 724, bottom: 788, height: 64 };
    fire('scroll');
    fire('scroll');
    expect(frames.size).toBe(1);
    flushFrames();
    expect(props.get(TOAST_BOTTOM_INSET_VAR)).toBe('84px');

    // And down again, until the bar is back in the upper half.
    rect = { top: 200, bottom: 264, height: 64 };
    fire('scroll');
    flushFrames();
    expect(props.has(TOAST_BOTTOM_INSET_VAR)).toBe(false);
  });

  it('lets go when it stops: no room kept, no listeners, no frame pending', () => {
    rect = { top: 724, bottom: 788, height: 64 };
    useToastClearance(bar);
    fire('scroll');
    cleanups.splice(0).forEach((cleanup) => cleanup());
    expect(props.has(TOAST_BOTTOM_INSET_VAR)).toBe(false);
    expect(listeners.get('scroll')?.size ?? 0).toBe(0);
    expect(listeners.get('resize')?.size ?? 0).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('does nothing while inactive', () => {
    rect = { top: 724, bottom: 788, height: 64 };
    useToastClearance(bar, false);
    expect(props.has(TOAST_BOTTOM_INSET_VAR)).toBe(false);
    expect(listeners.size).toBe(0);
  });
});
