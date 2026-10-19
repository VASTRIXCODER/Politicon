import { useMemo, useState, type CSSProperties } from 'react';
import { Info, Sparkles } from 'lucide-react';
import PolicyProvenance from '@/components/PolicyProvenance';
import BillPath from '@/components/feed/BillPath';
import AiDisclaimer, { confidenceLabel } from '@/components/ui/AiDisclaimer';
import Badge from '@/components/ui/Badge';
import CountUp from '@/components/ui/CountUp';
import StatusBadge from '@/components/ui/StatusBadge';
import { billPath } from '@/lib/billPath';
import { heroScaleNote } from '@/lib/transmission';
import { cn } from '@/lib/utils';
import { isMorphArriving, morphTarget } from '@/lib/viewTransition';
import type { FullAnalysis } from '@/types';
import { money, netReadout, recordFacts, sentenceCase, signedUSD } from './detailModel';
import { HERO_GRID } from './DetailStates';
import { Chamber, DirIcon, Kicker } from './parts';
import { HeroView } from './visuals';
import styles from './detail.module.css';

/*
 * "The Transmission", the impact page's hero. First the bill as the record
 * shows it: where the record comes from (the archive-gold seal only for one
 * verified against Congress.gov or Open States, "Unverified" otherwise), the
 * bill number and the chamber it started in, the title (the page's h1), and,
 * beside it on wide screens, where it stands on its way to law, read from
 * the record, never predicted. Then the stage: a full-width Chamber where
 * the bill sheet resolves into the user's own number (the TransmissionHero
 * scene, its poster before and without 3D), with that number counting up on
 * a solid plate beside it in teal or amber with its sign and its words, and
 * the profile it was worked out for. On a phone the plate comes straight
 * after the title (the number in the first screen), then the scene, then
 * the bill's path and provenance. Opened from a docket card, the card's bill
 * sheet morphs into the record line and title (lib/viewTransition), which
 * then skip their own rise.
 */

export interface TransmissionHeaderProps {
  a: FullAnalysis;
  analyzedAt: string | null;
  /** "Driven by your profile" (detailModel profileChips). */
  profileChips: string[];
}

export default function TransmissionHeader({ a, analyzedAt, profileChips }: TransmissionHeaderProps) {
  const path = useMemo(() => billPath(a.record, { billNumber: a.billNumber, region: a.record?.region }), [a.record, a.billNumber]);
  const record = recordFacts(a, path.origin);
  const rated = confidenceLabel(a.confidenceScore);
  // The words carry the level; a low one is said in ink, not caution's terracotta (beside the plate's cost amber it would read as part of the cost).
  const confidence = { ...rated, tone: rated.tone === 'text-caution' ? 'text-muted' : rated.tone };
  const net = netReadout(a.netAnnualImpact);
  // Arriving by the card's morph: the morph is this block's entrance.
  const [morphed] = useState(() => isMorphArriving('bill-sheet'));

  return (
    <section aria-labelledby="impact-title" className={cn(HERO_GRID, 'mb-10')}>
      <div {...morphTarget('bill-sheet')} className={cn(!morphed && styles.rise, 'min-w-0 lg:col-span-7 lg:row-start-1')}>
        {/* The record line: the seal (verified records only), then where the bill comes from. */}
        <p className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          {record.verified ? (
            <>
              <span aria-hidden="true" data-decorative="" className={styles.seal} />
              <Badge variant="gold">Official record</Badge>
            </>
          ) : (
            // Neutral, never gold (it marks only a verified record) and not a warning colour: unverified isn't wrong.
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-fg/20 px-2.5 py-0.5 text-meta font-medium text-muted">
              <Info className="h-3 w-3" aria-hidden /> Unverified
            </span>
          )}
          <span className="min-w-0 break-words font-mono-data text-meta font-medium uppercase tracking-[0.14em] text-muted">
            {[record.billNumber, record.line].filter(Boolean).join(' · ') || 'Not checked against an official record'}
          </span>
        </p>

        <h1 id="impact-title" className="text-display-sm font-display font-medium text-ink [overflow-wrap:anywhere] [text-wrap:balance]">
          {a.policyTitle}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="primary">{sentenceCase(a.category)}</Badge>
          {/* The stage only from the official record: an unverified analysis's status is the model's guess. */}
          {record.verified && <StatusBadge status={a.status} />}
          <span className={cn('ml-1 flex items-center gap-1 font-mono-data text-meta', confidence.tone)}>
            <Sparkles className="h-3 w-3" aria-hidden /> {confidence.label}
            {a.confidenceScore ? <> · {a.confidenceScore}/100<span className="sr-only"> (model-rated)</span></> : null}
          </span>
        </div>
      </div>

      {/* The stage, full width: the scene, and its plate beside it (first, on a phone). */}
      <Chamber
        side
        captionFirst
        className={cn(styles.rise, 'lg:col-span-12 lg:row-start-2')}
        style={{ '--rise-delay': '140ms' } as CSSProperties}
        caption={
          <>
            <Kicker>Net annual impact</Kicker>
            <p className={cn('mt-2 whitespace-nowrap font-mono-data text-[2.5rem] font-semibold leading-none tracking-tight sm:text-5xl', net.tone)}>
              <CountUp value={Math.round(a.netAnnualImpact)} format={signedUSD} srLabel={`${signedUSD(a.netAnnualImpact)} per year, ${net.words}`} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <p className="text-sm text-muted">
                <span className={cn('font-mono-data font-semibold', netReadout(a.netMonthlyImpact).tone)}>{money(a.netMonthlyImpact)}</span> / month · {net.words}
              </p>
              <span className="flex items-center gap-1.5 text-sm capitalize">
                <DirIcon d={a.direction} className="h-4 w-4" />
                <span className="text-muted">{a.direction}</span>
              </span>
            </div>
            <p className="mt-3 text-meta leading-relaxed text-muted [text-wrap:pretty]">{heroScaleNote(a.netAnnualImpact)}</p>
            <div className="mt-4 border-t border-fg/8 pt-3">
              <p id="profile-drivers" className="mb-2 font-mono-data text-meta uppercase tracking-[0.16em] text-muted">Driven by your profile</p>
              {profileChips.length > 0 ? (
                <ul aria-labelledby="profile-drivers" className="flex flex-wrap gap-1.5">
                  {profileChips.map((c) => (
                    <li key={c} className="rounded-full border border-fg/10 bg-fg/5 px-2.5 py-1 text-meta text-muted">{c}</li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted">Complete your profile for a sharper analysis.</p>}
            </div>
          </>
        }
      >
        <HeroView a={a} />
      </Chamber>

      {/* Where it stands: the record's stage and as-of date, then where that comes from. */}
      <div className={cn(styles.rise, 'min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1')} style={{ '--rise-delay': '90ms' } as CSSProperties}>
        <div className={cn(styles.record, 'rounded-pane p-4 sm:p-5')}>
          <Kicker>The bill’s path</Kicker>
          <BillPath path={path} className="mt-3" />
          {!path.known && (
            <p className="mt-1 text-meta text-muted">The stage is shown only for a bill checked against its official record.</p>
          )}
          <div className="mt-4 border-t border-fg/8 pt-3">
            {record.verified ? (
              <PolicyProvenance record={a.record} snapshotLabel />
            ) : (
              // Said in neutral ink, like the chip above: a note on the source, not a warning.
              <p className="flex items-start gap-1.5 text-meta text-muted">
                <Info className="mt-px h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span>Not verified against an official source — details may be incomplete or out of date. Check the official record before relying on it.</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={cn(styles.rise, 'min-w-0 lg:col-span-12 lg:row-start-3')} style={{ '--rise-delay': '190ms' } as CSSProperties}>
        {analyzedAt && (
          <p className="text-xs text-muted">Last analyzed {new Date(analyzedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
        )}
        <AiDisclaimer className="mt-3 max-w-3xl" />
      </div>

    </section>
  );
}
