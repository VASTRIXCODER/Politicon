import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A keyboard key, as in "Press <Kbd>Esc</Kbd> to close". */
export default function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5rem] items-center justify-center rounded-md border border-fg/15 bg-raised px-1.5 py-0.5',
        'font-mono text-meta font-medium text-muted shadow-[inset_0_-1px_0_rgb(var(--c-fg)/0.12)]',
        className
      )}
    >
      {children}
    </kbd>
  );
}
