/**
 * The accent light of a marketing card or step, as a colour token from
 * styles/tokens.css. Every tone here is AA as body text on paper and night
 * panes. Archive gold is only for content about the official record.
 */
export type Tone = 'violet-text' | 'gold' | 'accent';

/** The tone as a CSS colour (`rgb(var(--c-…))`), optionally at an alpha, for inline styles. */
export const toneColor = (tone: Tone, alpha?: number) =>
  `rgb(var(--c-${tone})${alpha === undefined ? '' : ` / ${alpha}`})`;
