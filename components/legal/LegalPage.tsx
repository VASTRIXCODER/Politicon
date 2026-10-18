import Link from 'next/link';
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { formatLegalDate } from '@/lib/legal';
import { cn } from '@/lib/utils';
import TocSpy from './TocSpy';
import styles from './legal.module.css';

/*
 * The reading pages (Privacy, Terms, Disclaimer, Help) as an editorial paper
 * document: a porcelain sheet with a masthead (eyebrow, a Fraunces title, a
 * dated stamp with a small violet seal) and an introduction
 * with a drop cap, then numbered sections at a comfortable measure (about
 * 68 characters). On wide screens a sticky table of contents, built from
 * the sections' headings, sits beside the sheet; on phones it folds into a
 * disclosure at the top. Printing gives the sheet alone, black on white.
 *
 *   <LegalPage title={<>Privacy <em>Policy</em></>} intro="…" updated={PRIVACY_UPDATED}>
 *     <Section title="What we collect">…</Section>
 *   </LegalPage>
 *
 * The page text lives in the pages themselves; this file only lays it out.
 */

export interface TocEntry {
  id: string;
  title: string;
}

/** "Who can use Politicon" → "who-can-use-politicon". */
export function sectionId(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
  /** Set by LegalPage: the anchor its table of contents links to. */
  id?: string;
  /** Set by LegalPage: the section's number on the page (1-based). */
  index?: number;
}

const isSection = (node: ReactNode): node is ReactElement<SectionProps> => isValidElement(node) && node.type === Section;

/**
 * The page's sections in order, with unique anchors (a repeated title gets
 * -2, -3…), and its children with each Section given its anchor and number.
 */
export function withAnchors(children: ReactNode): { entries: TocEntry[]; content: ReactNode[] } {
  const seen = new Map<string, number>();
  const entries: TocEntry[] = [];
  const content = Children.toArray(children).map((child) => {
    if (!isSection(child)) return child;
    const base = sectionId(child.props.title);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const id = count > 1 ? `${base}-${count}` : base;
    entries.push({ id, title: child.props.title });
    return cloneElement(child, { id, index: entries.length });
  });
  return { entries, content };
}

/**
 * The document's seal beside the "last updated" date and at its foot: a
 * ring, its ticks and the mark, in violet. Never archive gold: these are
 * Politicon's own documents, not official records.
 */
function DocumentSeal({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" data-decorative="" focusable="false" className={cn('text-primary-300', className)}>
      <circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="20" cy="20" r="15.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="0.6 2.7" opacity="0.8" />
      <circle cx="20" cy="20" r="12.6" fill="currentColor" opacity="0.12" />
      {/* The Aperture Dome, simplified: dome, lantern and colonnade. */}
      <path d="M13 21.4a7 7.6 0 0 1 14 0Z M19.2 11.6h1.6v2.6h-1.6Z M13.6 22.6h12.8v1.3H13.6Z M14.6 24.5h1.5v3.2h-1.5Z M17.6 24.5h1.5v3.2h-1.5Z M20.9 24.5h1.5v3.2h-1.5Z M23.9 24.5h1.5v3.2h-1.5Z M13 28.2h14v1.4H13Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The contents' links. `folded` is the phone copy inside a <details>: while
 * it is closed its content is skipped by rendering (content-visibility), and
 * a transition started there when TocSpy marks the current section never
 * gets to finish, so that copy changes state without one.
 */
function TocList({ entries, folded = false }: { entries: TocEntry[]; folded?: boolean }) {
  return (
    <ol className="space-y-0.5">
      {entries.map((entry, i) => (
        <li key={entry.id}>
          <a
            href={`#${entry.id}`}
            data-toc-link=""
            className={cn(
              'group flex gap-3 rounded-lg py-1.5 pl-3 pr-2 text-sm leading-snug text-muted transition-colors duration-200 ease-civic hover:text-ink',
              // The current section: ink, with a short bar of violet light on its left.
              'relative before:absolute before:left-0 before:top-2 before:h-[calc(100%-1rem)] before:w-[2px] before:rounded-full before:bg-primary before:opacity-0 before:shadow-[0_0_10px_rgb(var(--c-violet)/0.6)] before:transition-opacity',
              'data-[active]:text-ink data-[active]:before:opacity-100',
              folded && 'transition-none before:transition-none'
            )}
          >
            <span aria-hidden="true" className="font-mono-data text-meta text-primary-300">{String(i + 1).padStart(2, '0')}</span>
            <span>{entry.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function LegalPage({
  title,
  intro,
  children,
  updated,
  eyebrow = 'Legal',
  toc = true,
  aside,
}: {
  /** The h1. Wrap an accent word in <em> (the text itself must stay the page's name). */
  title: ReactNode;
  intro: string;
  children: ReactNode;
  /** ISO date the page's text last changed (from lib/legal), shown as "Last updated". */
  updated?: string;
  /** The masthead's kicker. */
  eyebrow?: string;
  /** A table of contents built from the Sections (default on). */
  toc?: boolean;
  /** A side column beside the sheet on wide screens (Help's contact card), below it on phones. */
  aside?: ReactNode;
}) {
  const { entries, content } = withAnchors(children);
  const showToc = toc && entries.length > 1;
  // A drop cap needs a paragraph long enough to wrap around it.
  const dropCap = intro.length > 140;

  return (
    <div className="relative min-h-screen">
      <div className="print:hidden">
        <AmbientBackground />
      </div>
      <div className="relative z-content">
        <div className="print:hidden">
          <Navbar />
        </div>
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32 print:max-w-none print:p-0">
          <Link href="/" className="group mb-8 inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-ink print:hidden">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-civic group-hover:-translate-x-1" aria-hidden="true" /> Back to home
          </Link>

          <div
            className={cn(
              'lg:grid lg:items-start lg:gap-10 xl:gap-14 print:block',
              showToc && 'lg:grid-cols-[13rem_minmax(0,1fr)]',
              aside && 'lg:grid-cols-[minmax(0,1fr)_19rem]'
            )}
          >
            {showToc && (
              <nav aria-label="On this page" className="sticky top-28 hidden lg:block print:hidden">
                <p className="mb-3 pl-3 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted">On this page</p>
                <TocList entries={entries} />
              </nav>
            )}

            <article className={cn('relative overflow-hidden rounded-pane border border-fg/8 bg-surface shadow-pane', styles.sheet)}>
              {/* A rim of violet light along the sheet's top edge. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent print:hidden"
              />
              <header className="border-b border-fg/8 px-5 pb-9 pt-9 sm:px-12 sm:pb-11 sm:pt-12">
                <div className="mb-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <p className="inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)] print:hidden"
                    />
                    Politicon · {eyebrow}
                  </p>
                  {updated && (
                    // The record stamp: when this text last changed.
                    <p className="inline-flex items-center gap-2.5 font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
                      <DocumentSeal className="h-7 w-7 flex-shrink-0" />
                      <span>
                        Last updated <time dateTime={updated} className="text-ink">{formatLegalDate(updated)}</time>
                      </span>
                    </p>
                  )}
                </div>
                <h1 className="font-display text-display-md font-medium text-ink">{title}</h1>
                <p className={cn('mt-7 max-w-[60ch] text-base leading-relaxed text-ink/90 sm:text-lg', dropCap && styles.lede)}>{intro}</p>
              </header>

              {showToc && (
                <nav aria-label="On this page" className="border-b border-fg/8 px-5 sm:px-12 lg:hidden print:hidden">
                  <details className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted [&::-webkit-details-marker]:hidden">
                      On this page
                      <span aria-hidden="true" className="text-base leading-none text-primary-300 transition-transform duration-300 ease-civic group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="-mx-3 mt-3">
                      <TocList entries={entries} folded />
                    </div>
                  </details>
                </nav>
              )}

              <div className="legal-prose max-w-[68ch] space-y-12 px-5 py-11 text-[0.9375rem] leading-[1.75] text-ink/85 sm:px-12 sm:py-14 sm:text-base">
                {content}
              </div>

              {/* The foot of the document. */}
              <div aria-hidden="true" className="flex items-center gap-4 px-5 pb-10 sm:px-12">
                <span className="h-px flex-1 bg-[linear-gradient(to_right,rgb(var(--c-fg)/0.18)_55%,transparent_0)] bg-[length:7px_1px]" />
                <DocumentSeal className="h-5 w-5 opacity-70" />
                <span className="h-px flex-1 bg-[linear-gradient(to_right,rgb(var(--c-fg)/0.18)_55%,transparent_0)] bg-[length:7px_1px]" />
              </div>
            </article>

            {aside && <div className="mt-8 lg:sticky lg:top-28 lg:mt-0">{aside}</div>}
          </div>
          {showToc && <TocSpy />}
        </main>
        <div className="print:hidden">
          <Footer />
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children, id, index }: SectionProps) {
  const anchor = id ?? sectionId(title);
  return (
    // Focusable from the table of contents (TocSpy), without a ring around the whole section.
    <section id={anchor} className="scroll-mt-28 outline-none">
      <h2 className="mb-4 flex items-baseline gap-3 font-display text-xl font-medium leading-snug tracking-[-0.01em] text-ink sm:text-[1.5rem]">
        {index !== undefined && (
          <span aria-hidden="true" className="font-mono-data text-meta font-normal tracking-normal text-primary-300">
            {String(index).padStart(2, '0')}
          </span>
        )}
        <span>{title}</span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
