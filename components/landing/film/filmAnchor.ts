/**
 * Keeping the reader in place when the film switches layout (the static
 * five-panel sequence and the pinned film are very different heights).
 * Pure arithmetic for FilmPlayer, kept apart from filmMath so the page's
 * first load carries only this (tests/film.test.ts covers both).
 */

/** Where the reader was, relative to the film, just before it switches layout. */
export type ScrollAnchor =
  | { kind: 'none' }
  /** Partway through: keep the same fraction of the way through. */
  | { kind: 'inside'; fraction: number }
  /** Past it: keep the content below exactly where it is on screen. */
  | { kind: 'past'; bottom: number };

/**
 * From the film block's box (viewport px) and the viewport height. Nothing
 * needs to move when the block starts on or below the top of the screen,
 * since only content below the reader changes size.
 */
export function anchorFor(top: number, height: number, viewport: number): ScrollAnchor {
  const bottom = top + height;
  if (top >= 0) return { kind: 'none' };
  if (bottom <= 0) return { kind: 'past', bottom };
  const span = height - viewport;
  return { kind: 'inside', fraction: span > 0 ? Math.min(1, Math.max(0, -top / span)) : 0 };
}

/**
 * How far to scroll (px, + is down) after the switch, given the block's new
 * box, so the reader stays at the same place in the story.
 */
export function anchorCorrection(anchor: ScrollAnchor, top: number, height: number, viewport: number): number {
  switch (anchor.kind) {
    case 'none':
      return 0;
    case 'past':
      return top + height - anchor.bottom;
    case 'inside':
      return top + anchor.fraction * Math.max(0, height - viewport);
  }
}
