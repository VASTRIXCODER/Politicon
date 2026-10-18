/**
 * Device tiers for the shared 3D stage (components/three/Stage.tsx).
 *
 *   0  No WebGL2, only a software rasteriser, Data Saver on, or the visitor
 *      chose "Visual effects: Off". No canvas is ever created: every
 *      SceneView keeps its server-rendered CSS poster.
 *   1  Phones and tablets (coarse pointer), deviceMemory <= 4 GB or
 *      hardwareConcurrency <= 4, or the visitor chose "Reduced". DPR <= 1.5,
 *      <= 4k particles, rim-lit physical glass instead of transmission, no
 *      postprocessing.
 *   2  Desktop-class. DPR <= 2, transmission glass, <= 25k particles, subtle
 *      bloom / chromatic aberration / vignette.
 *
 * detectTier() is pure (tests/tier.test.ts). useTier() is what components
 * read: it is 0 on the server and on the first client render (so the server
 * HTML is posters and hydration matches), and settles once the GPU has been
 * probed at idle time. The stage can lower it for the rest of the session
 * (capTier) when frames keep dropping or the GPU keeps losing the context.
 *
 * For visual QA, ?fx=0|1|2 forces a tier (and ?fx=auto clears it). It sticks
 * for the browser tab, and is ignored on the production deployment.
 */
import { useCallback, useSyncExternalStore } from 'react';

export type Tier = 0 | 1 | 2;
export type EffectsPref = 'full' | 'reduced' | 'off';

export const EFFECTS_STORAGE_KEY = 'pc-fx';
export const DEFAULT_EFFECTS: EffectsPref = 'full';
/** sessionStorage key that keeps a ?fx= override for the rest of the tab's visit. */
export const FX_OVERRIDE_STORAGE_KEY = 'pc-fx-override';

/** What the tier is decided from. Everything but webgl2 is optional (unknown = not limiting). */
export interface TierEnv {
  /** A WebGL2 context can be created at all. */
  webgl2: boolean;
  /** The only WebGL2 available is a software rasteriser (SwiftShader, llvmpipe…). */
  softwareRenderer?: boolean;
  /** navigator.connection.saveData. */
  saveData?: boolean;
  /** The primary pointer is coarse (a finger). */
  coarsePointer?: boolean;
  /** navigator.deviceMemory, in GB (Chromium only). */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency. */
  hardwareConcurrency?: number;
  /** The visitor's "Visual effects" choice. */
  pref?: EffectsPref;
  /** A QA override (?fx=), already gated by fxOverrideAllowed(). */
  override?: Tier | null;
}

export function isTier(v: unknown): v is Tier {
  return v === 0 || v === 1 || v === 2;
}

export function isEffectsPref(v: unknown): v is EffectsPref {
  return v === 'full' || v === 'reduced' || v === 'off';
}

export function detectTier(env: TierEnv): Tier {
  // Nothing can force a canvas onto a browser that can't make one.
  if (!env.webgl2) return 0;
  if (env.override != null) return env.override;
  if (env.pref === 'off' || env.saveData || env.softwareRenderer) return 0;
  const limited =
    !!env.coarsePointer ||
    (env.deviceMemory !== undefined && env.deviceMemory > 0 && env.deviceMemory <= 4) ||
    (env.hardwareConcurrency !== undefined && env.hardwareConcurrency > 0 && env.hardwareConcurrency <= 4);
  if (limited || env.pref === 'reduced') return 1;
  return 2;
}

/** Plain-language reasons for a tier, for the /lab readout. */
export function tierReasons(env: TierEnv): string[] {
  const out: string[] = [];
  if (!env.webgl2) return ['No WebGL2'];
  if (env.override != null) out.push(`Forced by ?fx=${env.override}`);
  if (env.softwareRenderer) out.push('Software renderer only');
  if (env.saveData) out.push('Data Saver is on');
  if (env.pref === 'off') out.push('Visual effects: Off');
  if (env.pref === 'reduced') out.push('Visual effects: Reduced');
  if (env.coarsePointer) out.push('Touch screen');
  if (env.deviceMemory !== undefined && env.deviceMemory > 0 && env.deviceMemory <= 4) out.push(`${env.deviceMemory} GB memory`);
  if (env.hardwareConcurrency !== undefined && env.hardwareConcurrency > 0 && env.hardwareConcurrency <= 4) out.push(`${env.hardwareConcurrency} CPU cores`);
  if (!out.length) out.push('Desktop-class device');
  return out;
}

/** ?fx= is a QA tool for local, CI and preview builds, never for production visitors. */
export function fxOverrideAllowed(vercelEnv: string | undefined = process.env.NEXT_PUBLIC_VERCEL_ENV): boolean {
  return vercelEnv !== 'production';
}

/**
 * The QA override from the query string, or else from what an earlier ?fx=
 * stored for this tab. ?fx=auto (or any other value) clears it.
 * Returns the override and what to store (undefined: leave storage alone).
 */
export function resolveFxOverride(
  search: string,
  stored: string | null,
  allowed: boolean
): { override: Tier | null; store?: string | null } {
  if (!allowed) return { override: null };
  const raw = new URLSearchParams(search).get('fx');
  if (raw !== null) {
    const n = Number(raw);
    const override = raw.trim() !== '' && isTier(n) ? n : null;
    return { override, store: override === null ? null : String(override) };
  }
  const n = Number(stored);
  return { override: stored !== null && stored !== '' && isTier(n) ? n : null };
}

// ---------------------------------------------------------------------------
// Browser side: one shared store for every useTier() caller.

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const COARSE = '(pointer: coarse)';

interface Probe {
  webgl2: boolean;
  softwareRenderer: boolean;
}

let probe: Probe | null = null;
let probeScheduled = false;
/** In-memory preference, for when localStorage is unavailable (private mode). */
let memoryPref: EffectsPref | null = null;
/** The runtime ceiling set by the stage (frame drops, repeated context loss). */
let cap: Tier = 2;
let snapshot: Tier = 0;
let details: TierDetails = { tier: 0, detected: 0, cap: 2, env: { webgl2: false }, probed: false };

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function readPref(): EffectsPref {
  try {
    const v = localStorage.getItem(EFFECTS_STORAGE_KEY);
    if (isEffectsPref(v)) return v;
  } catch {
    /* storage blocked: fall through to the in-memory choice */
  }
  return memoryPref ?? DEFAULT_EFFECTS;
}

function readOverride(): Tier | null {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(FX_OVERRIDE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const { override, store } = resolveFxOverride(window.location.search, stored, fxOverrideAllowed());
  if (store !== undefined) {
    try {
      if (store === null) sessionStorage.removeItem(FX_OVERRIDE_STORAGE_KEY);
      else sessionStorage.setItem(FX_OVERRIDE_STORAGE_KEY, store);
    } catch {
      /* ignore */
    }
  }
  return override;
}

function release(gl: WebGL2RenderingContext | null) {
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* ignore */
  }
}

function probeGpu(): Probe {
  try {
    // failIfMajorPerformanceCaveat refuses software rasterisers, which would
    // run every scene on the CPU.
    const gl = document
      .createElement('canvas')
      .getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    if (!gl) {
      const any = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null;
      release(any);
      return { webgl2: !!any, softwareRenderer: !!any };
    }
    let renderer = String(gl.getParameter(gl.RENDERER) ?? '');
    // Chromium masks RENDERER ("WebKit WebGL"); Firefox exposes it directly
    // and warns if the debug extension is used, so only ask when masked.
    if (/^webkit webgl$/i.test(renderer)) {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? renderer);
    }
    release(gl);
    return { webgl2: true, softwareRenderer: SOFTWARE_RENDERER.test(renderer) };
  } catch {
    return { webgl2: false, softwareRenderer: false };
  }
}

function readEnv(): TierEnv {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return {
    webgl2: probe?.webgl2 ?? false,
    softwareRenderer: probe?.softwareRenderer ?? false,
    saveData: !!nav.connection?.saveData,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches,
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
    pref: readPref(),
    override: readOverride(),
  };
}

function refresh() {
  if (!probe) return;
  const env = readEnv();
  const detected = detectTier(env);
  // A forced tier is for QA: the runtime ceiling doesn't second-guess it.
  const tier = (env.override != null ? detected : Math.min(detected, cap)) as Tier;
  details = { tier, detected, cap, env, probed: true };
  snapshot = tier;
  emit();
}

function runProbe() {
  probe = probeGpu();
  refresh();
}

function onStorage(e: StorageEvent) {
  if (e.key === EFFECTS_STORAGE_KEY) {
    prefEmit();
    refresh();
  }
}

function onPointerChange() {
  refresh();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    window.addEventListener('storage', onStorage);
    if (typeof window.matchMedia === 'function') window.matchMedia(COARSE).addEventListener?.('change', onPointerChange);
  }
  // Creating a probe context costs a few ms of main thread, so it waits for
  // the browser to be idle (after hydration and first paint).
  if (!probe && !probeScheduled) {
    probeScheduled = true;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
      .requestIdleCallback;
    if (ric) ric(runProbe, { timeout: 1500 });
    else window.setTimeout(runProbe, 200);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      window.removeEventListener('storage', onStorage);
      if (typeof window.matchMedia === 'function') window.matchMedia(COARSE).removeEventListener?.('change', onPointerChange);
    }
  };
}

/** The tier to render at right now. 0 on the server and until the GPU probe has run. */
export function useTier(): Tier {
  return useSyncExternalStore(subscribe, () => snapshot, () => 0);
}

export interface TierDetails {
  /** The tier in effect (what useTier returns). */
  tier: Tier;
  /** What detectTier() says for this device and preference, before the runtime ceiling. */
  detected: Tier;
  /** The runtime ceiling (2 unless the stage lowered it this session). */
  cap: Tier;
  env: TierEnv;
  /** Whether the GPU probe has run yet. */
  probed: boolean;
}

const SERVER_DETAILS: TierDetails = { tier: 0, detected: 0, cap: 2, env: { webgl2: false }, probed: false };

/** Everything behind the tier, for diagnostics (/lab). */
export function useTierDetails(): TierDetails {
  return useSyncExternalStore(subscribe, () => details, () => SERVER_DETAILS);
}

/**
 * Lowers the tier for the rest of this page session (never raises it). The
 * stage calls this when frames keep dropping at the lowest pixel ratio, or
 * the GPU keeps losing the WebGL context.
 */
export function capTier(next: Tier) {
  if (next >= cap) return;
  cap = next;
  refresh();
}

// Effects preference ("Visual effects: Full / Reduced / Off").

const prefListeners = new Set<() => void>();
const prefEmit = () => prefListeners.forEach((l) => l());

function subscribePref(onChange: () => void) {
  prefListeners.add(onChange);
  const onPrefStorage = (e: StorageEvent) => {
    if (e.key === EFFECTS_STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', onPrefStorage);
  return () => {
    prefListeners.delete(onChange);
    window.removeEventListener('storage', onPrefStorage);
  };
}

/** The saved "Visual effects" choice (default Full) and a setter that applies it at once. */
export function useEffectsPreference(): [EffectsPref, (pref: EffectsPref) => void] {
  const pref = useSyncExternalStore(subscribePref, readPref, () => DEFAULT_EFFECTS);
  const set = useCallback((next: EffectsPref) => {
    memoryPref = next;
    try {
      localStorage.setItem(EFFECTS_STORAGE_KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    prefEmit();
    refresh();
  }, []);
  return [pref, set];
}
