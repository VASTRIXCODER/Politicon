import type { ReactNode } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import { SETTINGS_SECTIONS, sectionHeadingId, type SettingsSectionId } from './settingsModel';

/*
 * The frame of a settings section and the paper panes inside it. The section
 * is the section nav's anchor (#experience, #account): it stops clear of the
 * floating navbar (and, on phones, of the sticky section bar under it) when
 * the nav or a link jumps to it, and its heading takes focus so keyboard and
 * screen-reader users land where they asked to go. It opens like the profile
 * section ("Your household"): an eyebrow naming it as the nav does, then an
 * editorial h2 and a lede. Server-safe: no hooks.
 */

/** Clears the floating navbar, and on phones the sticky section bar under it. */
export const SECTION_SCROLL_MARGIN = 'scroll-mt-40 lg:scroll-mt-28';

export function SettingsSection({ id, title, lede, children, className }: {
  id: SettingsSectionId;
  /** The h2. Wrap the accent words in <em>. */
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { label } = SETTINGS_SECTIONS.find((s) => s.id === id)!;
  const headingId = sectionHeadingId(id);
  return (
    <section id={id} aria-labelledby={headingId} className={cn(SECTION_SCROLL_MARGIN, className)}>
      <PageHeader
        as="h2"
        eyebrow={label}
        title={
          <span id={headingId} tabIndex={-1} className="rounded-md">
            {title}
          </span>
        }
        lede={lede}
      />
      <div className="mt-8">{children}</div>
    </section>
  );
}

/**
 * A solid paper pane holding rows split by hairlines (settings are content,
 * so never glass). `tone="danger"` frames destructive actions.
 */
export function SettingsPane({ children, tone = 'default', className, label }: {
  children: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
  /** A small mono kicker above the rows ("On this device"). */
  label?: ReactNode;
}) {
  return (
    <Surface
      pad="none"
      className={cn(
        'overflow-hidden',
        tone === 'danger' && 'border-danger/25 shadow-none dark:border-danger/30',
        className
      )}
    >
      {tone === 'danger' && (
        // A hairline of warning light along the top edge.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-danger/45 to-transparent"
        />
      )}
      {label && (
        <p className="border-b border-fg/8 px-5 py-3 font-mono-data text-meta font-medium uppercase tracking-[0.14em] text-muted sm:px-7">
          {label}
        </p>
      )}
      <div className="divide-y divide-fg/8">{children}</div>
    </Surface>
  );
}
