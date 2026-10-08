'use client';

import { m } from 'framer-motion';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Plain div props. Drag/animation event handlers are left out because Framer
// Motion uses the same names with different signatures.
type DivProps = Omit<
  ComponentPropsWithRef<'div'>,
  'children' | 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>;

export interface GlassCardProps extends DivProps {
  children: ReactNode;
  className?: string;
  /** Hover lift and highlight. Only for cards that are clickable. */
  hover?: boolean;
  /** Stronger violet shadow on hover (needs `hover`). */
  glow?: boolean;
  /** Entrance delay in seconds. */
  delay?: number;
  /** Fade/slide in when scrolled into view. */
  animate?: boolean;
}

export default function GlassCard({
  children,
  className,
  hover = false,
  glow = false,
  delay = 0,
  animate = true,
  ...props
}: GlassCardProps) {
  const classes = cn(
    'glass relative overflow-hidden',
    hover && 'glass-interactive',
    hover && glow && 'hover:shadow-[0_20px_60px_rgba(123,97,255,0.35)]',
    className
  );

  if (!animate) {
    return (
      <div {...props} className={classes}>
        {children}
      </div>
    );
  }

  return (
    <m.div
      {...props}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={classes}
    >
      {children}
    </m.div>
  );
}
