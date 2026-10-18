import AmbientBackground from '@/components/landing/AmbientBackground';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';

/**
 * Full-screen splash while the session or profile loads: the Aperture Dome
 * breathing in violet light, with a thread of light crossing a hairline below
 * it. Under reduced motion it holds still. The label is shown and announced
 * once as a polite status, so screen-reader users hear more than silence.
 */
export default function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center">
      <AmbientBackground />
      <div role="status" className="relative z-content flex flex-col items-center gap-7">
        <div aria-hidden="true" className="relative h-16 w-16">
          {/* The halo and the lens breathe together (opacity only, so it stays on the compositor). */}
          <span className="absolute -inset-12 bg-[radial-gradient(circle_closest-side,rgb(var(--c-violet)/0.3),rgb(var(--c-violet)/0.1)_45%,rgb(var(--c-violet)/0.03)_75%,transparent)] motion-safe:animate-pulse" />
          <svg viewBox={MARK_VIEWBOX} focusable="false" className="relative h-full w-full text-primary">
            <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="currentColor" />
            <path d={MARK_PATHS.aperture} className="fill-white motion-safe:animate-pulse dark:fill-violet-glow" />
          </svg>
        </div>
        {/* A thread of violet light passing along a hairline, now and then. */}
        <span aria-hidden="true" className="block h-[2px] w-32 overflow-hidden rounded-full bg-fg/8">
          <span className="block h-full w-full bg-[linear-gradient(90deg,transparent_0%,transparent_42%,rgb(var(--c-violet))_50%,transparent_58%,transparent_100%)] bg-[length:250%_100%] bg-no-repeat motion-safe:animate-shimmer" />
        </span>
        <p className="text-sm text-muted">{label}</p>
      </div>
    </main>
  );
}
