'use client';

import { useEffect, useRef } from 'react';
import { trackSpotlight } from '@/lib/hooks/useSpotlight';
import { cn } from '@/lib/utils';

/**
 * A soft violet light under the content of its parent that follows a mouse
 * pointer (see trackSpotlight). Drop it in as the first child of a pane:
 *
 *   <div className="relative isolate overflow-hidden …"><Spotlight />…</div>
 *
 * The parent needs `relative` (the light fills it) and `isolate` (the light
 * sits at z-index -1, above the parent's background but beneath its text, so
 * it never tints the copy). Purely decorative; invisible on touch screens and
 * under reduced motion.
 */
export default function Spotlight({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    return trackSpotlight(parent, el);
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-decorative=""
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-[var(--spot,0)] transition-opacity duration-500 ease-civic',
        'bg-[radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,50%),rgb(var(--c-glow)/0.16),transparent_70%)]',
        className
      )}
    />
  );
}
