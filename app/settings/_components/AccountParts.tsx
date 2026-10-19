import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The pieces the Account section's forms share: a row (what it is on the
 * left, the form on the right from lg; stacked on phones), field labels and
 * the field style. Server-safe.
 */

/** 16px text on phones: iOS zooms into smaller fields on focus. */
export const FIELD = 'input-glass w-full rounded-tile px-4 py-3 text-base sm:text-sm';

/** A field with a danger hairline (the delete-account confirmation). */
export const DANGER_FIELD = cn(FIELD, 'border-danger/30 focus:border-danger/60 dark:border-danger/35 dark:focus:border-danger/60');

/**
 * A form's (ink) submit button while there's nothing to send yet: a quiet
 * tint rather than a greyed-out slab of ink. (Busy buttons keep their ink.)
 */
export const WAITING_SUBMIT = 'bg-fg/8 text-muted shadow-none opacity-100 dark:bg-fg/10';

export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-sm font-medium text-ink">
      {children}
    </label>
  );
}

/** One account setting: its title and a sentence beside (lg) or above (phones) its form. */
export function AccountRow({ title, titleId, description, children, tone = 'default' }: {
  title: string;
  titleId?: string;
  description: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="grid gap-5 px-5 py-6 sm:px-7 sm:py-7 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <h3 id={titleId} className={cn('text-[0.9375rem] font-semibold', tone === 'danger' ? 'text-danger' : 'text-ink')}>
          {title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted [overflow-wrap:anywhere] [text-wrap:pretty]">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
