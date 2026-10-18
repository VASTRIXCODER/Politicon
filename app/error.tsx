'use client';

import { useEffect } from 'react';
import Button from '@/components/ui/Button';

/**
 * Shown when a page crashes while rendering; the rest of the app keeps
 * working. A calm moment in the Chamber: a night pane with a still aurora,
 * a lens of violet light breathing slowly at its centre, and a way to try
 * again. It ships in every page's first load, so it stays small: Tailwind
 * classes only, no icons or artwork modules, no stylesheet of its own.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      tabIndex={-1}
      data-night=""
      className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-16 text-ink"
    >
      {/* Aurora from the top edge and a low glow on the horizon. */}
      <div
        aria-hidden="true"
        data-decorative=""
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_50%_60%_at_30%_-10%,rgb(var(--c-violet)/0.32),transparent_72%),radial-gradient(ellipse_40%_50%_at_78%_-6%,rgb(var(--c-accent)/0.12),transparent_75%),radial-gradient(ellipse_90%_40%_at_50%_115%,rgb(var(--c-violet)/0.22),transparent_80%)]"
      />
      <div className="max-w-lg text-center" role="alert">
        {/* The lens: rings of glass around a point of light. */}
        <div aria-hidden="true" className="relative mx-auto mb-9 h-16 w-16">
          <span className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.3),transparent)] motion-safe:animate-pulse" />
          <span className="absolute inset-0 rounded-full border border-fg/15 bg-[radial-gradient(circle_at_35%_30%,rgb(var(--c-fg)/0.12),transparent_60%)] shadow-[inset_0_1px_0_rgb(var(--c-fg)/0.18)]" />
          <span className="absolute inset-[22%] rounded-full border border-primary/40" />
          <span className="absolute inset-[38%] rounded-full bg-violet-glow shadow-[0_0_18px_4px_rgb(var(--c-glow)/0.7)]" />
        </div>
        <h1 className="mb-3 font-display text-display-sm font-medium text-ink">
          Something went <em>wrong</em>
        </h1>
        <p className="mb-2 text-muted">This page hit an unexpected error. Your data is safe.</p>
        {error.digest && <p className="mb-6 font-mono-data text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset}>Try again</Button>
          <Button href="/dashboard" variant="ghost">
            Go to your dashboard
          </Button>
        </div>
      </div>
    </main>
  );
}
