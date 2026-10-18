import { ArrowUp, Lock, Sparkles } from 'lucide-react';
import { formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GUIDE_EXAMPLE } from './data';
import { ExampleStamp, Layer, Pane } from './parts';
import TiltStage from './TiltStage';
import styles from './mockups.module.css';

/**
 * The AI Policy Guide, "the Chamber", in miniature: a night pane with the
 * guide's orb, a what-if question and a non-partisan answer in dollars for
 * two sample households, with what it was based on. Its satellite shows the
 * profile ranges the guide reads. Figures are illustrative (lib/explorerData).
 */
export default function GuideMockup({ facing }: { facing: 'left' | 'right' }) {
  const { question, asker, contrast } = GUIDE_EXAMPLE;
  return (
    <TiltStage facing={facing} className="sm:mb-28">
      <Layer>
        <Pane night>
          {/* Header: the guide's presence and the reading mode. */}
          <div className="flex items-center justify-between gap-3 border-b border-fg/8 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={cn(styles.orb, 'h-8 w-8 flex-shrink-0')} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">AI Policy Guide</p>
                <p className="truncate text-meta text-muted">Profile loaded · Non-partisan · Dollar-specific answers</p>
              </div>
            </div>
            <span className="hidden flex-shrink-0 items-center rounded-full border border-fg/10 bg-fg/5 p-0.5 text-meta sm:flex">
              <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-ink">
                <Sparkles className="h-3 w-3 text-accent" strokeWidth={2} />
                Simple
              </span>
              <span className="px-2.5 py-1 text-muted">Expert</span>
            </span>
          </div>

          <div className="space-y-4 px-4 py-5 sm:px-5">
            {/* The question. */}
            <div className="flex justify-end">
              <p className="max-w-[82%] rounded-2xl rounded-tr-md border border-primary/25 bg-primary/20 px-4 py-2.5 text-sm leading-snug text-ink">
                {question}
              </p>
            </div>

            {/* The answer: both directions, in dollars, with sign and words. */}
            <div className="flex items-start gap-2.5">
              <span className={cn(styles.orb, 'mt-1 h-5 w-5 flex-shrink-0')} />
              <div className="min-w-0 max-w-[90%] rounded-2xl rounded-tl-md border border-fg/10 bg-fg/[0.04] px-4 py-3">
                <p className="text-sm leading-relaxed text-muted">
                  It depends on the household. For yours, earning{' '}
                  <span className="text-ink">{asker.bracket.label}</span>, slightly higher prices could{' '}
                  <span className="font-medium text-loss">cost about {formatUSD(Math.abs(asker.annual))} a year</span>. A household
                  earning <span className="text-ink">{contrast.bracket.label.toLowerCase()}</span> with a minimum-wage worker could{' '}
                  <span className="font-medium text-gain">gain about {formatUSD(contrast.annual)}</span>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-loss/30 bg-loss-fill/10 px-2.5 py-1 font-mono-data text-meta font-semibold text-loss">
                    {formatUSD(asker.annual, { signed: true, suffix: '/yr' })} · yours
                  </span>
                  <span className="rounded-lg border border-gain/30 bg-gain-fill/10 px-2.5 py-1 font-mono-data text-meta font-semibold text-gain">
                    {formatUSD(contrast.annual, { signed: true, suffix: '/yr' })} · {contrast.bracket.label}
                  </span>
                </div>
                <p className="mt-3 border-t border-fg/8 pt-2.5 text-meta text-muted">
                  <span className="text-ink">Based on</span> {asker.policy.title} (example) · your profile ranges
                </p>
                {/* The guide never takes a side. */}
                <p className="mt-1.5 text-meta text-muted">An educational estimate, not a recommendation for or against.</p>
              </div>
            </div>
          </div>

          {/* The composer. */}
          <div className="flex items-center gap-2 border-t border-fg/8 px-4 py-3 sm:px-5">
            <span className="flex-1 truncate rounded-full border border-fg/12 bg-fg/[0.04] px-4 py-2 text-meta text-muted">
              Ask a follow-up…
            </span>
            <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary-fill text-white">
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </span>
          </div>
        </Pane>
      </Layer>

      {/* The profile ranges the guide reads, lifted off the pane's outer bottom corner (from tablet widths). */}
      <Layer
        depth={110}
        className={cn('absolute -bottom-20 hidden w-56 sm:block', facing === 'left' ? 'right-3' : 'left-3')}
      >
        <Pane className="!rounded-tile px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">Your ranges</p>
            <ExampleStamp>Sample</ExampleStamp>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-meta">
            <dt className="text-muted">Income</dt>
            <dd className="text-right font-mono-data text-ink">{asker.bracket.label}</dd>
            <dt className="text-muted">Housing</dt>
            <dd className="text-right text-ink">Renting</dd>
            <dt className="text-muted">Household</dt>
            <dd className="text-right text-ink">2 adults</dd>
          </dl>
          <p className="mt-2.5 flex items-center gap-1.5 border-t border-fg/8 pt-2 text-meta text-muted">
            <Lock className="h-3 w-3 flex-shrink-0 text-primary-300" strokeWidth={2} />
            Ranges only, never your name or email
          </p>
        </Pane>
      </Layer>
    </TiltStage>
  );
}
