import { ArrowRight } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import KineticHeadline from '@/components/landing/KineticHeadline';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import { formatUSD } from '@/lib/format';
import { CATEGORIES } from '@/lib/explorerData';
import { cn } from '@/lib/utils';
import { SHARE_EXAMPLES } from './mockups/data';
import styles from './mockups/cards.module.css';

const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

// Illustrative designs for a feature that isn't built yet. The figures come
// from the explorer's illustrative dataset (lib/explorerData) and are chosen
// to be even-handed: a gain for a higher-income household, a gain for a
// lower-income one, and a cost that reaches every bracket.
const POSITIONS = ['left', 'center', 'right'] as const;
const exampleCards = SHARE_EXAMPLES.map(({ policy, bracket, annual }, i) => ({
  id: policy.id,
  number: String(i + 1).padStart(2, '0'),
  position: POSITIONS[i] ?? 'center',
  policy: policy.title,
  category: categoryLabel(policy.category),
  impact: formatUSD(annual, { signed: true }),
  household: `${bracket.label} household`,
  words: annual < 0 ? 'Could cost' : 'Could save',
  tone: annual < 0 ? 'text-loss' : 'text-gain',
}));

/**
 * The share-card designs as collectible impact cards: a porcelain face with
 * the mark pressed into it, and a night nameplate carrying the example
 * figure. A light island (data-day) over a night one (data-night), in both
 * themes. Decorative: the section's summary describes them.
 */
function ImpactCard({ card }: { card: (typeof exampleCards)[number] }) {
  return (
    <div data-day="" data-pos={card.position} className={styles.card}>
      <div className={cn(styles.face, 'flex flex-col text-ink')}>
        <div className={styles.frame} />
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="flex items-center gap-1.5">
            <LogoMark className="h-5 w-5" detail="small" />
            <span className="font-display text-sm font-medium">Politicon</span>
          </span>
          <span className="font-mono-data text-meta tracking-[0.14em] text-muted">No. {card.number}</span>
        </div>

        {/* The mark, embossed. */}
        <div className="flex flex-1 items-center justify-center">
          <svg viewBox={MARK_VIEWBOX} focusable="false" className={cn(styles.emboss, 'h-20 w-20')}>
            <path d={MARK_PATHS.dome + MARK_PATHS.base + MARK_PATHS.aperture} fill="currentColor" />
          </svg>
        </div>

        <div className="px-5 pb-4">
          <p className="font-mono-data text-meta uppercase tracking-[0.16em] text-muted">{card.category}</p>
          <p className="mt-1 font-display text-lg font-medium leading-snug text-ink">{card.policy}</p>
        </div>

        <div data-night="" className={cn(styles.plate, 'px-5 pb-5 pt-4 text-ink')}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-meta text-muted">{card.words}</p>
            <span className="rounded-full border border-dashed border-fg/30 px-2 py-0.5 font-mono-data text-meta text-muted">
              Example
            </span>
          </div>
          <p className={cn('mt-1.5 font-mono-data text-3xl font-semibold leading-none tracking-tight', card.tone)}>
            {card.impact}
            <span className="ml-0.5 text-base font-medium">/yr</span>
          </p>
          <p className="mt-2 text-meta text-muted">{card.household} · illustrative</p>
        </div>
      </div>
      <span className={styles.foil} />
    </div>
  );
}

export default function ShareableCards() {
  return (
    <section aria-labelledby="share-heading" data-scene-section="share" className="relative overflow-x-clip py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
        <div className="lg:col-span-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
              <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
              Share
            </p>
            <Badge variant="secondary" size="md" className="uppercase tracking-widest">
              Coming soon
            </Badge>
          </div>
          <KineticHeadline id="share-heading" className="mt-5 font-display text-display-md font-medium text-ink">
            Your impact, <em>as a card you can share.</em>
          </KineticHeadline>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
            We&apos;re working on turning an analysis into a card you can save or share. It isn&apos;t available yet;
            these are examples of the design.
          </p>
          <div className="mt-8">
            <Button href="/auth/signup" variant="secondary" size="lg" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
              Get your impact report
            </Button>
          </div>
        </div>

        <div className="lg:col-span-7">
          {/* Illustrations of the planned card; screen readers get the summary instead. */}
          <p className="sr-only">
            Example card designs, with illustrative figures, show a policy name, its category and an estimated dollar impact.
          </p>
          <div aria-hidden="true" data-decorative="" className={styles.hand}>
            {exampleCards.map((card) => (
              <ImpactCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
