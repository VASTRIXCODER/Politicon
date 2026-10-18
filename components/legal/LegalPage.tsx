import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { formatLegalDate } from '@/lib/legal';

/**
 * Shared layout for the Privacy, Terms, Disclaimer and Help pages: an
 * editorial sheet of paper on the page, with a Fraunces title, a dated
 * masthead and a comfortable reading measure (about 68 characters).
 */
export default function LegalPage({ title, intro, children, updated }: {
  title: string; intro: string; children: React.ReactNode;
  /** ISO date the page's text last changed (from lib/legal), shown as "Last updated". */
  updated?: string;
}) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <div className="relative z-content">
        <Navbar />
        <main id="main" tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
          <Link href="/" className="group mb-8 inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-civic group-hover:-translate-x-1" aria-hidden="true" /> Back to home
          </Link>

          <article className="relative overflow-hidden rounded-pane border border-fg/8 bg-surface shadow-pane">
            {/* A rim of violet light along the sheet's top edge. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
            />
            <header className="border-b border-fg/8 px-5 pb-8 pt-10 sm:px-12 sm:pb-10 sm:pt-14">
              <h1 className="font-display text-display-sm font-semibold text-ink">{title}</h1>
              {updated && (
                <p className="mt-4 font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
                  Last updated {formatLegalDate(updated)}
                </p>
              )}
              <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-ink/90 sm:text-lg">{intro}</p>
            </header>
            <div className="legal-prose max-w-[68ch] space-y-10 px-5 py-10 text-[0.9375rem] leading-[1.75] text-ink/85 sm:px-12 sm:py-12 sm:text-base">
              {children}
            </div>
          </article>
        </main>
        <Footer />
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-xl font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[1.375rem]">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
