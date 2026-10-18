'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { prefersLessMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { SETTINGS_SECTIONS, sectionHeadingId, type SettingsSectionId } from './settingsModel';

/*
 * The section nav: one list of jump links to Profile, Experience and Account,
 * drawn two ways. On phones it's a segmented bar that sticks under the
 * floating navbar, with a lit thumb under the section in view; from lg it's
 * a column beside the content, sticky, each link with a line saying what's
 * in it. Glass, because it's navigation (the sections are paper).
 *
 * The link for the section being read carries aria-current="location" (and,
 * in forced colours, which drop the thumb's fill and the lamp, an underline).
 * A jump scrolls there (smoothly unless motion is reduced or paused), focuses
 * the section's heading and puts its anchor in the address bar.
 */

const IDS = SETTINGS_SECTIONS.map((s) => s.id);

/** A section counts as "in view" once its top passes this far down the viewport. */
const READING_LINE = 0.32;

/** The section being read: the last whose top has passed the reading line (the last one at the page's foot). */
function useActiveSection(): [SettingsSectionId, (_id: SettingsSectionId) => void] {
  const [active, setActive] = useState<SettingsSectionId>(IDS[0]);
  // While a jump is scrolling, the section it's going to stays current (no flicker past the ones between).
  const pinned = useRef<SettingsSectionId | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (pinned.current) return;
      const line = window.innerHeight * READING_LINE;
      let current: SettingsSectionId = IDS[0];
      for (const id of IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      const root = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= root.scrollHeight - 2) current = IDS[IDS.length - 1];
      setActive(current);
    };
    const onScroll = () => {
      if (pinned.current) {
        // The jump has landed once scrolling stops for a moment.
        clearTimeout(settle.current);
        settle.current = setTimeout(() => {
          pinned.current = null;
          measure();
        }, 140);
        return;
      }
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(settle.current);
    };
  }, []);

  const pin = useCallback((id: SettingsSectionId) => {
    pinned.current = id;
    setActive(id);
    // An instant jump (or one that doesn't move) fires no scroll to release it.
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      pinned.current = null;
    }, 900);
  }, []);

  return [active, pin];
}

/** Scrolls to a section and focuses its heading (the frame's, or the section's first h2). */
export function jumpToSection(id: SettingsSectionId, { smooth = true } = {}) {
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView({ behavior: smooth && !prefersLessMotion() ? 'smooth' : 'auto', block: 'start' });
  const heading = document.getElementById(sectionHeadingId(id)) ?? section.querySelector<HTMLElement>('h2');
  if (!heading) return;
  // Focusable by script only, so it never becomes a Tab stop.
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

export default function SettingsNav({ className }: { className?: string }) {
  const [active, pin] = useActiveSection();
  const activeIndex = Math.max(0, IDS.indexOf(active));

  const onJump = (e: MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) => {
    // Let modified clicks (new tab, new window) do what they normally do.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    pin(id);
    jumpToSection(id);
    window.history.replaceState(null, '', `#${id}`);
  };

  return (
    <nav aria-label="Settings sections" className={className}>
      <ol
        className={cn(
          // Phones: a glass segmented bar. lg: a glass column.
          'glass relative grid grid-cols-3 rounded-full p-1',
          'lg:grid-cols-1 lg:gap-1 lg:rounded-pane lg:p-2',
          // A rim of violet light along the top edge, like the navbar's.
          'before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/40 before:to-transparent'
        )}
      >
        {/* Phones: the lit thumb under the current section (a transform, so it glides without layout work). */}
        <li
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-1 left-1 rounded-full border border-primary bg-raised lg:hidden',
            'shadow-[0_1px_2px_rgb(var(--c-fg)/0.1),0_6px_16px_-8px_rgb(var(--c-violet)/0.45)]',
            'dark:shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.08),0_6px_16px_-8px_rgb(var(--c-violet)/0.6)]',
            'transition-transform duration-300 ease-civic motion-reduce:transition-none'
          )}
          style={{ width: `calc((100% - 0.5rem) / ${IDS.length})`, transform: `translateX(${activeIndex * 100}%)` }}
        />
        {SETTINGS_SECTIONS.map((section) => {
          const current = section.id === active;
          // No numbers here: the profile's four sections carry 01–04, and one count per page reads clearer.
          return (
            <li key={section.id} className="relative min-w-0">
              <a
                href={`#${section.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={(e) => onJump(e, section.id)}
                className={cn(
                  'group flex min-h-10 items-center justify-center gap-3 rounded-full px-3 text-sm font-medium',
                  // Under 360px (a 320px phone, or 400% zoom) the three labels still fit whole.
                  'max-[359px]:px-1.5 max-[359px]:text-[0.8125rem]',
                  'transition-colors duration-200 ease-civic',
                  'lg:min-h-0 lg:justify-start lg:rounded-tile lg:px-3.5 lg:py-2.5',
                  current
                    ? 'text-ink lg:bg-primary/8'
                    : 'text-muted hover:text-ink lg:hover:bg-fg/4'
                )}
              >
                <span className="min-w-0 truncate lg:whitespace-normal">
                  <span className={cn('block truncate', current && 'forced-colors:underline forced-colors:decoration-2 forced-colors:underline-offset-4')}>
                    {section.label}
                  </span>
                  <span className="hidden text-meta font-normal text-muted lg:block">{section.description}</span>
                </span>
                {/* lg: a point of violet light, like a status lamp. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'ml-auto hidden h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)] lg:block',
                    'transition-opacity duration-300 ease-civic',
                    current ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
