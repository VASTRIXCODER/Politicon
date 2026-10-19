import type { Cue } from '@/lib/sound';

/**
 * The cues' synthesizer, behind lib/sound: every cue is made with WebAudio
 * (oscillators and a shared noise buffer), so there are no audio files to
 * fetch and nothing for the CSP to allow. lib/sound loads this module only
 * once the visitor has sound on (it's off by default), so no page's first
 * load carries it.
 *
 * The AudioContext is created lazily, on the first cue played, and only ever
 * started or resumed once the person has interacted with the page, so
 * nothing autoplays. When sound is turned on before this module has loaded,
 * lib/sound makes the context inside that click and hands it over (adopt).
 */

/** One layer of a cue: a source, an optional filter, and an attack/release envelope. */
export interface Voice {
  /** An oscillator shape, or 'noise' for the shared white-noise buffer. */
  source: 'noise' | 'sine' | 'triangle';
  /** Oscillator pitch, in Hz. */
  frequency?: number;
  filter?: {
    type: 'bandpass' | 'highpass' | 'lowpass';
    /** Cutoff or centre, in Hz, at the start of the voice. */
    frequency: number;
    /** Where the cutoff sweeps to by the end of the voice (exponentially). */
    to?: number;
    q: number;
  };
  /** Start, in seconds after the cue is played. */
  at: number;
  /** Rise to the peak, in seconds. */
  attack: number;
  /** Fall from the peak to silence, in seconds. */
  release: number;
  /** Peak level, 0..1 (before the master volume). */
  peak: number;
}

/*
 * The cues. Short and soft: everything ends within 400 ms except the chime,
 * which rings out for under a second.
 *
 *   rustle  paper: a few uneven bursts of band-passed noise
 *   chime   two sine partials (a fifth apart) with a long, warm decay
 *   whoosh  air: noise through a band-pass that sweeps upward, swelling and fading
 *   tick    a tiny high click
 */
export const CUES: Record<Cue, readonly Voice[]> = {
  rustle: [
    { source: 'noise', filter: { type: 'bandpass', frequency: 3200, q: 0.9 }, at: 0, attack: 0.008, release: 0.07, peak: 0.55 },
    { source: 'noise', filter: { type: 'bandpass', frequency: 2400, q: 0.8 }, at: 0.055, attack: 0.012, release: 0.09, peak: 0.4 },
    { source: 'noise', filter: { type: 'bandpass', frequency: 4100, q: 1.1 }, at: 0.13, attack: 0.006, release: 0.06, peak: 0.32 },
    { source: 'noise', filter: { type: 'bandpass', frequency: 2900, q: 0.7 }, at: 0.19, attack: 0.015, release: 0.11, peak: 0.22 },
  ],
  chime: [
    { source: 'sine', frequency: 587.33, at: 0, attack: 0.012, release: 0.84, peak: 0.5 },
    { source: 'sine', frequency: 880, at: 0.004, attack: 0.012, release: 0.58, peak: 0.2 },
  ],
  whoosh: [
    { source: 'noise', filter: { type: 'bandpass', frequency: 320, to: 2600, q: 1.3 }, at: 0, attack: 0.16, release: 0.22, peak: 0.6 },
  ],
  tick: [
    { source: 'triangle', frequency: 1900, at: 0, attack: 0.002, release: 0.022, peak: 0.28 },
  ],
};

/** How long a cue lasts, in seconds, from play to silence. */
export function cueDuration(cue: Cue): number {
  return Math.max(...CUES[cue].map((v) => v.at + v.attack + v.release));
}

/** Overall loudness. Kept low: these are accents, not alerts. */
const MASTER_VOLUME = 0.18;
/** The same cue fired again within this window (e.g. a fan of cards) plays once. */
const REPEAT_GAP_MS = 60;
/** exponentialRamp can't reach 0; this is silence for our purposes. */
const SILENT = 0.0001;

/* ── Audio graph (created on first use) ── */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
const lastPlayed: Partial<Record<Cue, number>> = {};

type AudioContextConstructor = typeof AudioContext;

/**
 * Whether the page may start audio: the person has clicked, tapped or typed
 * on it at some point. Browsers without the User Activation API get the
 * benefit of the doubt (they still block audio themselves until a gesture).
 */
function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation ? activation.hasBeenActive : true;
}

/** Takes `audio` as the context every cue plays through, behind the master volume. */
function takeContext(audio: AudioContext): AudioContext {
  ctx = audio;
  master = audio.createGain();
  master.gain.value = MASTER_VOLUME;
  master.connect(audio.destination);
  return audio;
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  if (!hasUserActivation()) return null;
  const Ctor: AudioContextConstructor | undefined =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return takeContext(new Ctor());
  } catch {
    return null;
  }
}

/**
 * Takes over the context lib/sound made inside the click that turned sound
 * on, before this module had arrived (WebKit starts audio only within the
 * gesture itself). One context only: a second is closed.
 */
export function adopt(audio: AudioContext): void {
  if (!ctx) takeContext(audio);
  else if (audio !== ctx) void audio.close().catch(() => undefined);
}

/** Resumes a suspended context, but only once the person has interacted with the page. */
export function wake() {
  if (ctx?.state === 'suspended' && hasUserActivation()) void ctx.resume().catch(() => undefined);
}

/** Releases the audio device while sound is off (it resumes on the next cue). */
export function quiet() {
  if (ctx?.state === 'running') void ctx.suspend().catch(() => undefined);
}

/** One second of white noise, shared by every noise voice (each starts at a random offset). */
function noiseBuffer(audio: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === audio.sampleRate) return noise;
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

function playVoice(audio: AudioContext, out: AudioNode, v: Voice, start: number) {
  const peakAt = start + v.attack;
  const end = peakAt + v.release;

  const env = audio.createGain();
  env.gain.setValueAtTime(SILENT, start);
  env.gain.exponentialRampToValueAtTime(v.peak, peakAt);
  env.gain.exponentialRampToValueAtTime(SILENT, end);

  let source: AudioScheduledSourceNode;
  if (v.source === 'noise') {
    const s = audio.createBufferSource();
    s.buffer = noiseBuffer(audio);
    // A different stretch of noise each time, so repeated rustles don't sound identical.
    s.start(start, Math.random() * 0.5);
    source = s;
  } else {
    const o = audio.createOscillator();
    o.type = v.source;
    o.frequency.setValueAtTime(v.frequency ?? 440, start);
    o.start(start);
    source = o;
  }

  let node: AudioNode = source;
  if (v.filter) {
    const f = audio.createBiquadFilter();
    f.type = v.filter.type;
    f.Q.value = v.filter.q;
    f.frequency.setValueAtTime(v.filter.frequency, start);
    if (v.filter.to) f.frequency.exponentialRampToValueAtTime(v.filter.to, end);
    node.connect(f);
    node = f;
  }
  node.connect(env);
  env.connect(out);

  source.stop(end + 0.02);
  source.onended = () => env.disconnect();
}

/** Plays a cue now (lib/sound's playCue has already checked that sound is on and the tab is visible). */
export function play(cue: Cue): void {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - (lastPlayed[cue] ?? -Infinity) < REPEAT_GAP_MS) return;

  const audio = context();
  if (!audio || !master) return;
  wake();
  lastPlayed[cue] = now;

  // A few ms of lead time so the first envelope point isn't already in the past.
  const start = audio.currentTime + 0.01;
  for (const voice of CUES[cue]) playVoice(audio, master, voice, start + voice.at);
}
