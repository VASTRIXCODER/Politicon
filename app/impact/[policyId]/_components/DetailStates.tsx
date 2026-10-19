import { Loader2, Target } from 'lucide-react';
import Button from '@/components/ui/Button';
import IconTile from '@/components/ui/IconTile';
import Skeleton from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/*
 * The impact page before it has an analysis to show: the shape of the page
 * while the stored analysis (or the page's code) loads, and the screen that
 * offers to generate one. Server-safe; the page passes the handlers in.
 */

// Violet-tinted action: primary-300 text keeps it at AA contrast on the tint.
const TINT_BUTTON = 'bg-primary/20 hover:bg-primary/30 border-primary/20 text-primary-300';

/** The hero's grid, shared with TransmissionHeader so nothing moves when the analysis arrives. */
export const HERO_GRID = 'grid items-start gap-8 lg:grid-cols-12 lg:gap-10';

export function DetailSkeleton({ generating = false }: { generating?: boolean }) {
  return (
    <>
      <div role="status" className="mb-8 flex items-center gap-3 text-sm text-muted">
        {generating ? (
          <><Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden /> Compiling your full financial analysis…</>
        ) : (
          <span className="sr-only">Loading your analysis…</span>
        )}
      </div>
      <div aria-hidden="true" data-decorative="">
        <div className={HERO_GRID}>
          <div className="min-w-0 lg:col-span-7 lg:row-start-1">
            <Skeleton shape="line" className="mb-5 w-56 max-w-full" />
            <Skeleton className="mb-3 h-11 w-full max-w-xl" />
            <Skeleton className="h-11 w-2/3" />
          </div>
          {/* The stage's frame is already night, so the hero never flashes from day to night. Its plate comes first on a phone, as the hero's does. */}
          <div
            data-night=""
            className="relative flex flex-col overflow-hidden rounded-[2rem] bg-canvas p-3 sm:p-4 lg:col-span-12 lg:row-start-2 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-center lg:gap-4"
          >
            <Skeleton className="aspect-[10/9] w-full rounded-pane lg:aspect-[16/9]" />
            <Skeleton className="order-first mb-3 h-40 w-full rounded-pane lg:order-none lg:mb-0" />
          </div>
          <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <Skeleton className="h-36 w-full rounded-pane" />
          </div>
        </div>
        <Skeleton className="mb-8 mt-10 h-12 w-full max-w-3xl rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-pane" />)}
        </div>
      </div>
    </>
  );
}

export function NoAnalysis({
  legacy,
  generating,
  error,
  onGenerate,
}: {
  legacy: boolean;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="relative mb-6">
        {/* A pool of violet light behind the tile. */}
        <span
          aria-hidden="true"
          data-decorative=""
          className="absolute -inset-5 rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.22),transparent)]"
        />
        <IconTile icon={Target} tone="violet" size="lg" className="relative" />
      </span>
      <h1 className="font-display text-display-sm font-medium text-ink [text-wrap:balance]">
        {legacy ? 'Update this analysis' : 'No analysis yet'}
      </h1>
      <p role="status" className="mx-auto mb-6 mt-3 max-w-md text-sm leading-relaxed text-muted [text-wrap:pretty]">
        {generating
          ? 'Compiling your full financial analysis. This can take up to a minute…'
          : legacy
            ? 'This is a short summary from an earlier version of Politicon. Generate the full breakdown to see every chart and section.'
            : 'Generate a full, personalized analysis of this policy from your feed.'}
      </p>
      {error && <p role="alert" className="mb-6 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          onClick={onGenerate}
          disabled={generating}
          aria-busy={generating || undefined}
          className="px-5"
          icon={generating ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {generating ? 'Generating…' : legacy ? 'Generate full analysis' : 'Generate analysis'}
        </Button>
        <Button href="/dashboard" variant="ghost" className={cn('px-5', TINT_BUTTON)}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
