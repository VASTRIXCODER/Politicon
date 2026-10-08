'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';

/**
 * App-wide Framer Motion setup.
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
