'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/**
 * The product's one easing curve, cubic-bezier(.2,.7,.2,1), for Motion
 * transitions. CSS uses the same curve as `ease-civic` / var(--ease-civic).
 */
export const EASE_CIVIC = [0.2, 0.7, 0.2, 1] as const;

/**
 * Motion setup for the signed-in app, rendered by each app route's layout
 * (app/dashboard, app/impact, …): only those pages animate with motion/react,
 * so the marketing pages never load it.
 * - reducedMotion="user": when the OS asks for reduced motion, transform and
 *   layout animations jump to their end state (opacity/colour still fade).
 * - LazyMotion + domAnimation: lets components use the lightweight `m.*`
 *   elements (animations, variants, exit, hover/tap/focus, inView) instead of
 *   `motion.*`, which bundles every feature. Drag and layout animations are
 *   not included; components that need them keep using `motion.*`.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
