'use client';

import { m } from 'motion/react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import Spotlight from '@/components/ui/Spotlight';
import { EASE_CIVIC } from '@/components/providers/MotionProvider';
import { useLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

// Plain div props. Drag/animation event handlers are left out because Motion
// uses the same names with different signatures.
type DivProps = Omit<
  ComponentPropsWithRef<'div'>,
  'children' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>;

export interface GlassCardProps extends DivProps {
  children: ReactNode;
  className?: string;
  /** Hover lift, violet rim and a cursor spotlight. Only for cards that are clickable. */
  hover?: boolean;
  /** Stronger violet glow on hover (needs `hover`). */
  glow?: boolean;
  /** Entrance delay in seconds. */
  delay?: number;
  /** Fade/slide in when scrolled into view. */
  animate?: boolean;
}

/**
 * The original card API, kept so existing pages don't change. It now draws a
 * solid paper pane (the same look as <Surface variant="paper">): cards hold
 * numbers and charts, which never sit behind glass. New code should use
 * Surface. Callers set the radius and padding with classes (rounded-2xl p-6).
 */
export default function GlassCard({
  children,
  className,
  hover = false,
  glow = false,
  delay = 0,
  animate = true,
  ...props
}: GlassCardProps) {
  const reduceMotion = useLessMotion();

  const classes = cn(
    'relative overflow-hidden rounded-2xl',
    'bg-surface border border-fg/8 shadow-pane',
    hover && [
      'isolate transition-[border-color,box-shadow,background-color,translate] duration-300 ease-civic',
      'focus-within:border-primary/40',
      '[@media(hover:hover)]:hover:border-primary/30 [@media(hover:hover)]:hover:shadow-lift',
      'motion-safe:[@media(hover:hover)]:hover:[translate:0_-2px]',
    ],
    hover && glow && '[@media(hover:hover)]:hover:shadow-glow',
    className
  );

  const content = (
    <>
      {hover && <Spotlight />}
      {children}
    </>
  );

  if (!animate) {
    return (
      <div {...props} className={classes}>
        {content}
      </div>
    );
  }

  return (
    <m.div
      {...props}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      // Reduced motion: no slide (MotionConfig skips transforms) and no slow fade either.
      transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay, ease: EASE_CIVIC }}
      className={classes}
    >
      {content}
    </m.div>
  );
}
