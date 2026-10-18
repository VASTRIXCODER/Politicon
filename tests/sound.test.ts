import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { CUES, SOUND_STORAGE_KEY, cueDuration, isSoundEnabled, parseSoundPreference, playCue, type Cue } from '@/lib/sound';
import SoundToggle from '@/components/ui/SoundToggle';

const ALL: Cue[] = ['rustle', 'chime', 'whoosh', 'tick'];

describe('sound preference', () => {
  it('is stored under pc-sound', () => {
    expect(SOUND_STORAGE_KEY).toBe('pc-sound');
  });

  it('is on only for an explicit "on"', () => {
    expect(parseSoundPreference('on')).toBe(true);
    for (const v of ['off', '', 'ON', 'true', '1', 'yes', null, undefined, 1, true, {}]) {
      expect(parseSoundPreference(v), String(v)).toBe(false);
    }
  });

  it('is off on the server, and playing a cue there does nothing', () => {
    expect(isSoundEnabled()).toBe(false);
    for (const cue of ALL) expect(() => playCue(cue)).not.toThrow();
  });
});

describe('cues', () => {
  it('are short: under 400 ms, the chime under 900 ms', () => {
    for (const cue of ALL) {
      const limit = cue === 'chime' ? 0.9 : 0.4;
      expect(cueDuration(cue), cue).toBeGreaterThan(0);
      expect(cueDuration(cue), cue).toBeLessThanOrEqual(limit);
    }
  });

  it('are quiet, well-formed envelopes in the audible range', () => {
    for (const cue of ALL) {
      for (const v of CUES[cue]) {
        expect(v.attack, cue).toBeGreaterThan(0);
        expect(v.release, cue).toBeGreaterThan(0);
        expect(v.at, cue).toBeGreaterThanOrEqual(0);
        expect(v.peak, cue).toBeGreaterThan(0);
        expect(v.peak, cue).toBeLessThanOrEqual(0.6);
        if (v.source !== 'noise') expect(v.frequency, cue).toBeGreaterThan(20);
        for (const f of [v.filter?.frequency, v.filter?.to]) {
          if (f !== undefined) expect(f, cue).toBeGreaterThan(20);
          if (f !== undefined) expect(f, cue).toBeLessThan(20_000);
        }
      }
    }
  });
});

/* ── A minimal fake WebAudio, enough to watch what the module creates and schedules. ── */

class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeNode {
  connect<T>(node: T) { return node; }
  disconnect() {}
}
class FakeSource extends FakeNode {
  started?: number;
  stopped?: number;
  onended: (() => void) | null = null;
  start(t = 0) { this.started = t; }
  stop(t = 0) { this.stopped = t; }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' = 'running';
  currentTime = 1;
  sampleRate = 8_000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { return Object.assign(new FakeNode(), { gain: new FakeParam() }); }
  createBiquadFilter() { return Object.assign(new FakeNode(), { type: 'lowpass', frequency: new FakeParam(), Q: new FakeParam() }); }
  createOscillator() { return this.track(Object.assign(new FakeSource(), { type: 'sine', frequency: new FakeParam() })); }
  createBufferSource() { return this.track(Object.assign(new FakeSource(), { buffer: null as unknown })); }
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { sampleRate, getChannelData: () => data };
  }
  private track<T extends FakeSource>(s: T) { this.sources.push(s); return s; }
}

describe('playCue in a browser', () => {
  let store: Map<string, string>;
  let activation: { hasBeenActive: boolean };

  beforeEach(() => {
    vi.resetModules();
    FakeAudioContext.instances = [];
    store = new Map();
    activation = { hasBeenActive: true };
    vi.stubGlobal('window', { AudioContext: FakeAudioContext, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('navigator', { userActivation: activation });
    vi.stubGlobal('document', { visibilityState: 'visible' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const load = () => import('@/lib/sound');

  it('never creates audio while sound is off (the default)', async () => {
    const sound = await load();
    expect(sound.isSoundEnabled()).toBe(false);
    for (const cue of ALL) sound.playCue(cue);
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('saves the choice, and creates one context lazily on the first cue', async () => {
    const sound = await load();
    sound.setSoundEnabled(true);
    expect(store.get('pc-sound')).toBe('on');
    expect(FakeAudioContext.instances).toHaveLength(0);

    sound.playCue('chime');
    sound.playCue('tick');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('reads a saved "on" from storage', async () => {
    store.set('pc-sound', 'on');
    const sound = await load();
    expect(sound.isSoundEnabled()).toBe(true);
  });

  it('stops every voice by the end of its cue', async () => {
    const sound = await load();
    sound.setSoundEnabled(true);
    for (const cue of ALL) {
      sound.playCue(cue);
      const ctx = FakeAudioContext.instances[0];
      const voices = ctx.sources.splice(0);
      expect(voices.length, cue).toBe(CUES[cue].length);
      for (const v of voices) {
        expect(v.started, cue).toBeGreaterThanOrEqual(ctx.currentTime);
        // Lead-in (10 ms) + the cue + the stop margin (20 ms).
        expect(v.stopped! - ctx.currentTime, cue).toBeLessThanOrEqual(sound.cueDuration(cue) + 0.03 + 1e-9);
      }
    }
  });

  it('plays a cue fired twice in a row once', async () => {
    const sound = await load();
    sound.setSoundEnabled(true);
    sound.playCue('rustle');
    sound.playCue('rustle');
    expect(FakeAudioContext.instances[0].sources).toHaveLength(CUES.rustle.length);
  });

  it('waits for the person to interact with the page before starting audio', async () => {
    activation.hasBeenActive = false;
    const sound = await load();
    sound.setSoundEnabled(true);
    sound.playCue('chime');
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('stays silent in a hidden tab', async () => {
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    const sound = await load();
    sound.setSoundEnabled(true);
    sound.playCue('whoosh');
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('releases the audio device when turned off, and resumes when turned on', async () => {
    const sound = await load();
    sound.setSoundEnabled(true);
    sound.playCue('tick');
    const ctx = FakeAudioContext.instances[0];

    sound.setSoundEnabled(false);
    expect(store.get('pc-sound')).toBe('off');
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    ctx.state = 'suspended';

    sound.setSoundEnabled(true);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
  });
});

describe('SoundToggle', () => {
  it('server-renders an unpressed "Sound effects" toggle button', () => {
    const html = renderToString(h(SoundToggle));
    expect(html).toMatch(/^<button type="button" aria-pressed="false"/);
    expect(html).toContain('Sound effects');
  });
});
