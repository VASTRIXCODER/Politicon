import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import KineticHeadline from '@/components/landing/KineticHeadline';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';
import styles from './mockups/scenery.module.css';

interface ClosingCtaProps {
  /** True when state bills are loaded (Open States is configured): only then are state legislatures named. */
  stateBills: boolean;
}

/**
 * The page's last scene: the paper dips into the Chamber for the final call
 * to action, a pane of night set into the page just above the footer, with
 * the dome rising over its horizon.
 *
 * A night section in the stage's sense (data-scene-night, see
 * components/three/AmbientField.tsx): it paints its own night, a night
 * canvas with aurora curtains and a horizon of light, which is what tier-0
 * devices, reduced motion and every visitor before the stage loads see.
 * Once the WebGL field paints the Chamber behind it, the stage marks it
 * data-scene-night-live, app/globals.css drops its background colour and the
 * CSS aurora fades out, so the light isn't drawn twice. data-night flips the
 * tokens inside, so its text uses the night palette (AA on it).
 *
 * The sign-up link is worded unlike the hero's "Get My Impact Report" (the
 * page has exactly one link by that name). A server component; the buttons
 * are the only client code.
 */
export default function ClosingCta({ stateBills }: ClosingCtaProps) {
  const promises = ['Free', 'Non-partisan', 'Educational estimates', 'Not financial, tax or legal advice', 'For adults 18+'];

  return (
    <div className="px-2 pb-2 pt-10 sm:px-4 sm:pb-4 sm:pt-16">
      <section
        data-night=""
        data-scene-night=""
        data-scene-section="closing"
        aria-labelledby="closing-heading"
        className={cn(
          'group/night relative isolate overflow-hidden rounded-[2rem] bg-canvas text-ink sm:rounded-[3rem]',
          // A hairline rim and the night's own depth, so it reads as a pane in the dark theme too.
          'shadow-[inset_0_0_0_1px_rgb(var(--c-fg)/0.08),inset_0_1px_0_rgb(var(--c-fg)/0.12),0_40px_90px_-40px_rgb(0_0_0/0.6)]'
        )}
      >
        <div aria-hidden="true" data-decorative="" className={cn(styles.aurora, 'group-data-[scene-night-live]/night:opacity-0')}>
          <div className={cn(styles.curtain, 'motion-safe:[@media(pointer:fine)]:animate-drift-2')} />
        </div>
        <div aria-hidden="true" data-decorative="" className={styles.horizon} />
        <svg aria-hidden="true" data-decorative="" focusable="false" viewBox={MARK_VIEWBOX} className={styles.dome}>
          <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="none" stroke="currentColor" strokeWidth="0.35" />
          <path d={MARK_PATHS.aperture} fill="currentColor" opacity="0.6" />
        </svg>

        <div className="relative z-content mx-auto max-w-5xl px-5 pb-44 pt-20 text-center sm:px-8 sm:pb-64 sm:pt-28 lg:px-10">
          <p className="flex items-center justify-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
            Your turn
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-l from-transparent to-primary/70" />
          </p>
          <KineticHeadline id="closing-heading" className="mx-auto mt-6 max-w-4xl font-display text-display-lg font-medium text-ink">
            The next bill is already moving. <em>See what it means for you.</em>
          </KineticHeadline>
          <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-muted">
            Answer a few questions in ranges, never exact figures, and Politicon estimates how real bills
            {stateBills ? ' from Congress and your state legislature' : ' from Congress'} could change your household&apos;s
            budget, in plain English and in dollars.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/auth/signup" variant="primary" size="lg" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
              Create your free report
            </Button>
            <Button href="/explorer" variant="ghost" size="lg">
              Try the Explorer
            </Button>
          </div>

          <ul
            aria-label="What to expect"
            className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono-data text-meta text-muted"
          >
            {promises.map((promise, i) => (
              <li key={promise} className="flex items-center gap-5">
                {i > 0 && <span aria-hidden="true" className="hidden h-1 w-1 rotate-45 bg-primary/60 sm:block" />}
                {promise}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
