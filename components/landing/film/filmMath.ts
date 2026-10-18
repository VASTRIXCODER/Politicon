/**
 * The arithmetic of the scroll-driven film, kept pure so tests/film.test.ts
 * can pin it down: how far through its track the page has scrolled, where
 * each shot comes to rest, how much of each rail segment is lit, and where a
 * gentle snap would settle.
 *
 * The track is a tall box; a sticky stage the height of the viewport sits
 * at its top and stays pinned while the rest of the track scrolls past. The
 * film's progress is how much of that pinned stretch has gone by.
 */
import { FILM_SHOTS } from '@/lib/three/film';
import { STILL_PROGRESS, TIMELINE } from '@/components/three/scenes/filmShots';

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Progress 0 → 1 through the pinned stretch, from the track's top edge in
 * viewport px (getBoundingClientRect().top), the track's height and the
 * stage's height. 0 before the stage pins, 1 once it lets go.
 */
export function trackProgress(trackTop: number, trackHeight: number, stageHeight: number): number {
  const distance = trackHeight - stageHeight;
  return distance > 0 ? clamp01(-trackTop / distance) : 0;
}

/**
 * Where a shot comes to rest (what the rail jumps to and a snap settles
 * on): the moment the 3D film composes that shot (its still frame,
 * components/three/scenes/filmShots.ts), or the middle of the shot's share
 * if the film has no still for it.
 */
export function shotRestProgress(shot: number): number {
  const i = Math.round(Math.min(FILM_SHOTS - 1, Math.max(0, Number.isFinite(shot) ? shot : 0)));
  const still = STILL_PROGRESS[i];
  return still !== undefined && Math.floor(clamp01(still) * FILM_SHOTS) === i ? clamp01(still) : (i + 0.5) / FILM_SHOTS;
}

/** The document scroll position (px) at which the film shows `progress`. */
export function scrollTopForProgress(progress: number, trackDocTop: number, trackHeight: number, stageHeight: number): number {
  return trackDocTop + clamp01(progress) * Math.max(0, trackHeight - stageHeight);
}

/** How much of a shot's rail segment is lit, 0 … 1. */
export function segmentFill(progress: number, shot: number): number {
  return clamp01(clamp01(progress) * FILM_SHOTS - shot);
}

/**
 * The progress a settled scroll should ease to, or null to stay put: the
 * nearest shot's rest point, when it's within `reach` of a shot's share
 * (0.18 = 18% of one shot's scroll length) but not already there (closer
 * than `minPx` px over a pinned stretch `distancePx` long).
 */
export function snapTarget(progress: number, distancePx: number, reach = 0.18, minPx = 2): number | null {
  const p = clamp01(progress);
  // Before the first shot settles and after the last, the reader is arriving
  // or leaving: never pull them back.
  if (distancePx <= 0 || p < shotRestProgress(0) || p > shotRestProgress(FILM_SHOTS - 1)) return null;
  let best = 0;
  for (let i = 1; i < FILM_SHOTS; i++) {
    if (Math.abs(shotRestProgress(i) - p) < Math.abs(shotRestProgress(best) - p)) best = i;
  }
  const target = shotRestProgress(best);
  const gap = Math.abs(target - p);
  if (gap * distancePx < minPx) return null;
  return gap <= reach / FILM_SHOTS ? target : null;
}

/**
 * The progress at which the page around the film dips into night with it
 * (captions, scrim and rail in night tokens): once the scene's own sky is
 * mostly night (most of the way through filmShots' TIMELINE.dusk, where its
 * violet hour gives way to night), so a near-black caption scrim never sits
 * beside a sky still in twilight, nor paper beside night for long. Never
 * before the night shot's caption is up. Infinity when the film has no
 * night shot.
 */
export function duskProgress(nightShot: number, share = 0.65): number {
  if (!(nightShot >= 0)) return Infinity;
  const { start, end } = TIMELINE.dusk;
  return Math.min(1, Math.max(nightShot / FILM_SHOTS, start + (end - start) * share));
}
