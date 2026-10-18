import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { INITIAL_SCENE_STATE, sceneStore } from '@/lib/three/sceneStore';
import { SCENE_PALETTES, mixHex } from '@/lib/three/palette';
import { THEMES } from '@/lib/design/tokens';
import SceneView from '@/components/three/SceneView';

afterEach(() => sceneStore.reset());

describe('sceneStore', () => {
  it('starts at the top of a light page with the pointer centred', () => {
    expect(sceneStore.get()).toEqual({ scroll: 0, section: '', theme: 'light', pointer: { x: 0, y: 0 } });
    expect(sceneStore.get()).toBe(INITIAL_SCENE_STATE);
  });

  it('merges partial updates', () => {
    sceneStore.set({ scroll: 0.5 });
    sceneStore.set({ theme: 'dark' });
    expect(sceneStore.get()).toMatchObject({ scroll: 0.5, theme: 'dark', section: '' });
  });

  it('notifies only on a real change, with the new and previous state', () => {
    const listener = vi.fn();
    const unsubscribe = sceneStore.subscribe(listener);
    sceneStore.set({ scroll: 0 });
    sceneStore.set({ pointer: { x: 0, y: 0 } });
    expect(listener).not.toHaveBeenCalled();

    sceneStore.set({ pointer: { x: 0.25, y: -1 } });
    expect(listener).toHaveBeenCalledTimes(1);
    const [next, previous] = listener.mock.calls[0];
    expect(next.pointer).toEqual({ x: 0.25, y: -1 });
    expect(previous.pointer).toEqual({ x: 0, y: 0 });

    unsubscribe();
    sceneStore.set({ section: 'hero' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps a slice stable until it changes (safe for useSyncExternalStore)', () => {
    sceneStore.set({ pointer: { x: 1, y: 1 } });
    const pointer = sceneStore.get().pointer;
    sceneStore.set({ scroll: 0.2 });
    expect(sceneStore.get().pointer).toBe(pointer);
  });
});

describe('scene palette', () => {
  it("paints the field's base with the page background, so the canvas fades in without a seam", () => {
    expect(SCENE_PALETTES.light.field.base).toBe(THEMES.light.canvas);
    expect(SCENE_PALETTES.dark.field.base).toBe(THEMES.dark.canvas);
    expect(SCENE_PALETTES.light.canvas).toBe(THEMES.light.canvas);
    expect(SCENE_PALETTES.dark.canvas).toBe(THEMES.dark.canvas);
  });

  it('marks night', () => {
    expect(SCENE_PALETTES.light.night).toBe(false);
    expect(SCENE_PALETTES.dark.night).toBe(true);
  });

  it('only holds valid hex colours', () => {
    const walk = (v: unknown, path: string): void => {
      if (typeof v === 'string') expect(v, path).toMatch(/^#[0-9A-F]{6}$/i);
      else if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) walk(c, `${path}.${k}`);
    };
    walk(SCENE_PALETTES, 'palettes');
  });

  it('mixes hex colours', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(mixHex('#6D4AFF', '#6D4AFF', 0.3)).toBe('#6D4AFF');
  });
});

// What the server sends for a 3D box: the poster, never the scene.
describe('SceneView on the server', () => {
  const Marker = () => h('span', { 'data-marker': 'scene' }, 'scene content');

  it('renders the box and its poster, and none of the 3D content', () => {
    const html = renderToString(
      h(SceneView, { className: 'aspect-square', poster: h('i', { 'data-poster': '' }), children: h(Marker) })
    );
    expect(html).toContain('data-poster');
    expect(html).not.toContain('data-marker');
    expect(html).toContain('data-scene-view="poster"');
    expect(html).toMatch(/class="relative aspect-square"/);
  });

  it('is decorative without a label', () => {
    const html = renderToString(h(SceneView, { poster: null, children: null }));
    expect(html).toMatch(/^<div[^>]*aria-hidden="true"[^>]*data-decorative=""/);
    expect(html).not.toContain('role="img"');
  });

  it('is a labelled image with a label, and keeps the poster out of the accessibility tree', () => {
    const html = renderToString(h(SceneView, { poster: h('i'), label: 'The Capitol in porcelain', children: null }));
    expect(html).toMatch(/^<div[^>]*role="img"[^>]*aria-label="The Capitol in porcelain"/);
    expect(html.match(/^<div[^>]*>/)?.[0]).not.toContain('aria-hidden');
    // The poster wrapper.
    expect(html).toMatch(/<div aria-hidden="true" data-decorative=""/);
  });
});
