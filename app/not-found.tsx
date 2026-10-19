import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import AmbientBackground from '@/components/landing/AmbientBackground';
import LostBillPoster from '@/components/errors/LostBillPoster';
import SceneView from '@/components/three/SceneView';
import LostBill from '@/components/three/scenes/LostBill.lazy';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
};

/** Where this page got to, as a bill's progress (a joke, and only a procedural one). */
const STAGES = [
  { label: 'Introduced', state: 'done' },
  { label: 'In committee', state: 'current' },
  { label: 'Floor vote', state: 'todo' },
  { label: 'Signed', state: 'todo' },
] as const;

/**
 * The 404 page: a bill that got lost in committee. The message and the ways
 * out come first; beside them (below them on phones) a single sheet of
 * paper turns in a shaft of soft light (the LostBill scene, over its CSS
 * poster), captioned like a figure in a report.
 */
export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <AmbientBackground />
      <div className="relative z-content">
        <Navbar />
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto grid min-h-[100svh] max-w-6xl items-center gap-10 px-4 pb-20 pt-28 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16 lg:pb-16"
        >
          <div className="max-w-xl">
            <p className="mb-5 inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)]"
              />
              Error 404
            </p>
            <h1 className="font-display text-display-md font-medium text-ink">
              We couldn’t find <em>that page</em>
            </h1>
            <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-muted sm:text-lg">
              This page got lost in committee. The link may be out of date, or the page may have moved.
            </p>

            {/* The page's "status", in the style of a bill's progress. */}
            <ol aria-label="Where this page got to" className="mt-9 grid max-w-md grid-cols-4 gap-2">
              {STAGES.map((stage) => (
                <li key={stage.label} aria-current={stage.state === 'current' ? 'step' : undefined} className="min-w-0">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mb-2.5 block h-[3px] rounded-full',
                      stage.state === 'done' && 'bg-primary/60',
                      stage.state === 'current' && 'bg-primary shadow-[0_0_12px_rgb(var(--c-glow)/0.9)]',
                      stage.state === 'todo' && 'bg-fg/10'
                    )}
                  />
                  <span
                    className={cn(
                      'block font-mono-data text-meta',
                      stage.state === 'current' ? 'text-primary-300' : 'text-muted'
                    )}
                  >
                    {stage.label}
                  </span>
                  {/* aria-current says as much to assistive tech; on a phone the highlight alone does. */}
                  {stage.state === 'current' && <span className="mt-0.5 hidden text-meta text-muted sm:block">This page is here</span>}
                </li>
              ))}
            </ol>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button href="/" size="lg">
                Go to the home page
              </Button>
              <Button href="/help" variant="ghost" size="lg">
                Get help
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted">
              Or explore how example policies affect different incomes in the{' '}
              <Link href="/explorer" className="rounded text-primary-300 underline underline-offset-2 hover:text-ink">
                Public Impact Explorer
              </Link>
              .
            </p>
          </div>

          <figure className="mx-auto w-full max-w-[32rem]">
            <SceneView className="aspect-square w-full" poster={<LostBillPoster />}>
              <LostBill />
            </SceneView>
            <figcaption className="mt-2 text-center font-mono-data text-meta text-muted">
              Fig. 404 · A bill, adrift between committee and the floor.
            </figcaption>
          </figure>
        </main>
      </div>
    </div>
  );
}
