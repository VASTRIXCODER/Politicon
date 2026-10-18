import Badge from '@/components/ui/Badge';
import { CITY_DATA, DIRECTION_WORD, signedPhrase } from '@/components/three/scenes/bracketCityData';
import { BRACKETS, CATEGORIES, EXAMPLE_POLICIES, largestEffect, type CategoryKey } from '@/lib/explorerData';
import { formatUSD, impactSign, type ImpactSign } from '@/lib/format';
import { cn } from '@/lib/utils';

/*
 * The example policies behind the city, as a docket of paper cards. Each
 * shows its category and level of government, its one-line hypothetical,
 * how it spreads across the five brackets (small columns up for gains and
 * down for costs, every card on one shared scale, each with its figure in
 * text) and the bracket it affects most. Server-rendered and static.
 */

const TONE: Record<ImpactSign, string> = { gain: 'text-gain', loss: 'text-loss', neutral: 'text-muted' };

const CAT_DOT: Record<CategoryKey, string> = {
  taxes: 'bg-cat-taxes',
  healthcare: 'bg-cat-healthcare',
  housing: 'bg-cat-housing',
  employment: 'bg-cat-employment',
};

const categoryLabel = (key: CategoryKey) => CATEGORIES.find((c) => c.key === key)?.label ?? key;
const shortOf = (key: string) => CITY_DATA.districts.find((d) => d.bracket === key)?.short ?? key;

/** One scale for every card's columns: the largest single amount in any policy. */
const POLICY_SCALE = Math.max(1, ...EXAMPLE_POLICIES.flatMap((p) => Object.values(p.annualByBracket).map(Math.abs)));

export default function PolicyDocket() {
  return (
    <ul className="grid gap-4 sm:gap-5 md:grid-cols-2">
      {EXAMPLE_POLICIES.map((policy) => {
        const { bracket, amount } = largestEffect(policy);
        return (
          <li key={policy.id}>
            <article className="relative flex h-full flex-col rounded-pane border border-fg/8 bg-surface p-5 shadow-pane sm:p-6">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-data text-meta uppercase tracking-[0.14em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', CAT_DOT[policy.category])} />
                  {categoryLabel(policy.category)}
                </span>
                <Badge variant="example" className="normal-case tracking-wide">
                  {policy.scope} example
                </Badge>
              </div>
              <h3 className="mt-4 font-display text-xl font-medium leading-snug text-ink [text-wrap:balance]">{policy.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{policy.summary}</p>

              <div className="mt-auto pt-6">
                {/* How it spreads across the brackets: up for gains, down for costs, all cards on one scale. */}
                <div aria-hidden="true" className="relative grid h-20 grid-cols-5 gap-2 border-y border-fg/6">
                  <span className="absolute inset-x-0 top-1/2 h-px bg-fg/20" />
                  {BRACKETS.map((b) => {
                    const v = policy.annualByBracket[b.key];
                    const pct = v === 0 ? 0 : Math.max(4, (Math.abs(v) / POLICY_SCALE) * 50);
                    return (
                      <span key={b.key} className="relative">
                        {v !== 0 && (
                          <span
                            className={cn(
                              'absolute left-1/2 w-3 -translate-x-1/2',
                              v > 0 ? 'bottom-1/2 rounded-t-[3px] bg-gain-fill' : 'top-1/2 rounded-b-[3px] bg-loss-fill'
                            )}
                            style={{ height: `${pct}%` }}
                          />
                        )}
                      </span>
                    );
                  })}
                </div>
                <dl className="mt-2 grid grid-cols-5 gap-2 text-center">
                  {BRACKETS.map((b) => {
                    const v = policy.annualByBracket[b.key];
                    return (
                      <div key={b.key} className="min-w-0">
                        <dt className="truncate font-mono-data text-meta text-muted">
                          <span aria-hidden="true">{shortOf(b.key)}</span>
                          <span className="sr-only">{b.label} households</span>
                        </dt>
                        <dd className={cn('font-mono-data text-meta font-medium tabular-nums', TONE[impactSign(v)])}>
                          {formatUSD(v, { signed: true })}
                          <span className="sr-only"> a year, {DIRECTION_WORD[impactSign(v)].toLowerCase()}</span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                <p className="mt-4 border-t border-fg/8 pt-4 text-meta text-muted">
                  Largest effect: <span className="text-ink">{bracket.label} households</span>,{' '}
                  <span className={cn('font-mono-data font-medium', TONE[impactSign(amount)])}>{signedPhrase(amount)}</span>
                </p>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
