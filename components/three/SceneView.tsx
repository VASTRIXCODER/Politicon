'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTier } from '@/lib/three/tier';
import { SceneBoundary, sceneViews, stageGeneration, useStageGeneration, useStageStatus } from '@/components/three/runtime';
import { cn } from '@/lib/utils';

/*
 * A box on the page where a 3D scene appears.
 *
 *   <SceneView className="aspect-[4/3]" poster={<DomePoster />} label="The Politicon mark in violet glass">
 *     <SceneCamera position={[0, 0, 4]} />
 *     <StudioLights />
 *     <ApertureDome3D />
 *   </SceneView>
 *
 * The server renders the box and its poster, and the poster stays until the
 * scene has drawn its first frame, so the HTML is meaningful without
 * JavaScript and hydration matches. On tier 0 (or while the stage is down)
 * nothing 3D is ever mounted. The scene renders into this box on the single
 * shared stage canvas, and only while the box is on screen.
 *
 * Rules of the road:
 * - Size the box with className (aspect-* or h-*); poster and scene fill it.
 * - The poster is decoration. Meaning goes in `label` (read by screen
 *   readers) or in the DOM around the box; the canvas is aria-hidden.
 * - The stage canvas sits behind the page, so put the box straight on the
 *   page background or inside a pane with no fill (an 'outline' Surface).
 *   An opaque pane, including glass, hides the scene.
 * - Children are R3F scene content, imported from components/three/kit/lazy
 *   (never from the kit modules themselves, which would pull three.js into
 *   the page's first-load bundle). Add a <SceneCamera> to each view.
 * - Inside a [data-night] section the kit uses its night palette (and
 *   [data-day] the day one), whatever the page theme.
 */

const ViewTunnel = dynamic(() => import('@/components/three/ViewTunnel'), { ssr: false });

export interface SceneViewProps {
  className?: string;
  /** Server-rendered stand-in (CSS 2.5D), shown until the scene draws and whenever 3D is off. */
  poster: ReactNode;
  /** What the scene shows, for screen readers. Without it the whole box is decorative. */
  label?: string;
  /** R3F scene content (from components/three/kit/lazy). */
  children: ReactNode;
  /** Mount the scene as soon as the stage is up (the hero), not when the box nears the viewport. */
  eager?: boolean;
  /** The scene takes pointer events over its box (raycasting through document.body). */
  interactive?: boolean;
}

/** How long the poster takes to fade once the scene is up (matches duration-500). */
const POSTER_FADE_MS = 500;

export default function SceneView({ className, poster, label, children, eager = false, interactive = false }: SceneViewProps) {
  const tier = useTier();
  const status = useStageStatus();
  const generation = useStageGeneration();
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(eager);
  const [onScreen, setOnScreen] = useState(false);
  const [tone, setTone] = useState<'light' | 'dark' | null>(null);
  // The stage generation this view last drew in (a new canvas means drawing again).
  const [readyIn, setReadyIn] = useState(-1);
  const [posterGone, setPosterGone] = useState(false);

  const live = tier > 0 && status === 'ready' && near;
  const shown = live && readyIn === generation;

  // A page with a scene on it is what brings the stage in (StageLoader).
  useEffect(() => sceneViews.claim(), []);

  useEffect(() => {
    const el = box.current;
    if (tier === 0 || !el) return;
    // A night (or day) section around the box sets the scene's palette.
    const zone = el.closest('[data-night], [data-day]');
    setTone(zone ? (zone.hasAttribute('data-night') ? 'dark' : 'light') : null);

    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      setOnScreen(true);
      return;
    }
    // Mount a little ahead of the viewport, so the scene is ready when it arrives.
    const ahead = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) setNear(true);
    }, { rootMargin: '50% 0px' });
    const visible = new IntersectionObserver(([e]) => setOnScreen(!!e?.isIntersecting));
    ahead.observe(el);
    visible.observe(el);
    return () => {
      ahead.disconnect();
      visible.disconnect();
    };
  }, [tier]);

  // Once the scene is up, take the faded poster out of the layout and the
  // accessibility tree; bring it straight back if the scene goes away.
  useEffect(() => {
    if (!shown) {
      setPosterGone(false);
      return;
    }
    const id = window.setTimeout(() => setPosterGone(true), POSTER_FADE_MS);
    return () => window.clearTimeout(id);
  }, [shown]);

  // Read at call time: the canvas that just drew may be newer than this render.
  const onReady = useCallback(() => setReadyIn(stageGeneration.get()), []);

  return (
    <div
      ref={box}
      className={cn('relative', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-decorative={label ? undefined : ''}
      data-scene-view={shown ? 'live' : 'poster'}
    >
      <div
        aria-hidden="true"
        data-decorative=""
        hidden={posterGone}
        className={cn('absolute inset-0 transition-opacity duration-500 ease-civic', shown && 'opacity-0')}
      >
        {poster}
      </div>
      {live && (
        // If the 3D half can't load, the poster simply stays.
        <SceneBoundary>
          <ViewTunnel visible={onScreen} interactive={interactive} tone={tone} onReady={onReady}>
            {children}
          </ViewTunnel>
        </SceneBoundary>
      )}
    </div>
  );
}
