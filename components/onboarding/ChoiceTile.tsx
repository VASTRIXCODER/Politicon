import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * The answers in onboarding: porcelain tiles that lift a hair on hover and,
 * once chosen, take a violet light edge and a lit mark (a filled dot for one
 * answer, a check for several), so the choice never shows by colour alone.
 * The semantics live on the caller's element (role="radio" with
 * aria-checked in components/forms/RadioGroup, or a button with
 * aria-pressed); these are only its looks.
 */

export function tileClass(selected: boolean, className?: string) {
  return cn(
    'group relative w-full overflow-hidden rounded-tile border px-4 py-3.5 text-left text-[0.9375rem] leading-snug text-ink',
    'transition-[background-color,border-color,box-shadow,translate,opacity] duration-200 ease-civic',
    'disabled:cursor-not-allowed disabled:opacity-45',
    selected
      ? 'border-primary/60 bg-raised font-medium shadow-[inset_0_1px_0_rgb(255_255_255/0.7),0_0_0_3px_rgb(var(--c-violet)/0.14),0_14px_30px_-16px_rgb(var(--c-violet)/0.75)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_0_3px_rgb(var(--c-violet)/0.22),0_14px_30px_-16px_rgb(var(--c-violet)/0.9)]'
      : cn(
          'border-fg/10 bg-raised/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_1px_2px_rgb(21_18_31/0.05)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]',
          'enabled:hover:border-fg/20 enabled:hover:bg-raised motion-safe:[@media(hover:hover)]:enabled:hover:-translate-y-px'
        ),
    className
  );
}

/** The light along a chosen tile's leading edge. */
export function TileEdge({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-primary shadow-[0_0_14px_2px_rgb(var(--c-glow)/0.7)] transition-opacity duration-300 ease-civic',
        on ? 'opacity-100' : 'opacity-0'
      )}
    />
  );
}

/** A tile's mark: a ring that fills with light (one answer) or a box that takes a check (several). */
export function TileMark({ on, multiple = false }: { on: boolean; multiple?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-[1.125rem] w-[1.125rem] flex-shrink-0 items-center justify-center border transition-[background-color,border-color,box-shadow] duration-200 ease-civic',
        // Forced colours (Windows contrast themes) drop backgrounds: the mark keeps system colours instead.
        'forced-colors:[forced-color-adjust:none]',
        multiple ? 'rounded-[5px]' : 'rounded-full',
        on
          ? 'border-primary-fill bg-primary-fill shadow-[0_0_10px_rgb(var(--c-glow)/0.75)] forced-colors:border-[Highlight] forced-colors:bg-[Highlight]'
          : 'border-fg/45 bg-raised forced-colors:border-[CanvasText] forced-colors:bg-[Canvas]'
      )}
    >
      {on &&
        (multiple ? (
          <Check className="h-3 w-3 text-white forced-colors:text-[HighlightText]" strokeWidth={3} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-white forced-colors:bg-[HighlightText]" />
        ))}
    </span>
  );
}

/** A tile's content: the label, then its mark. */
export function TileBody({ label, on, multiple }: { label: string; on: boolean; multiple?: boolean }) {
  return (
    <>
      <TileEdge on={on} />
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <TileMark on={on} multiple={multiple} />
      </span>
    </>
  );
}
