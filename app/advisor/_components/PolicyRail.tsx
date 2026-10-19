import { GripVertical, MessageSquare, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { POLICY_DRAG_TYPE, relevanceBand, type RailPolicy } from '@/components/guide/policyRail';
import { formatUSD, impactSign, impactWords } from '@/lib/format';
import { cn } from '@/lib/utils';

/*
 * "Your policies": the user's feed and their own analyses as chips they can
 * drag onto the guide's orb (or into the composer) to ask about one. Every
 * chip has an "Ask about this policy" button, which does the same from the
 * keyboard, a screen reader or a touch screen (drag and drop is a mouse
 * convenience, never the only way).
 *
 * Feed items show the feed's relevance (its score and its band in words,
 * as the feed cards print it), category and likely direction; an analysed
 * policy shows the user's own estimate, signed and in words, in ledger teal
 * (saves you) or ember amber (costs you), and never the feed's guess beside
 * it, which could point the other way.
 */

// The same relevance colours as the feed cards: never the gain/loss pair.
const RELEVANCE_BADGE = (score: number) =>
  score >= 70 ? 'text-primary-300 bg-primary/10 border-primary/25'
    : score >= 40 ? 'text-accent bg-accent/10 border-accent/25'
    : 'text-muted bg-fg/5 border-fg/12';

function Direction({ d }: { d: RailPolicy['direction'] }) {
  if (!d) return null;
  const [Icon, color, label] =
    d === 'positive' ? [TrendingUp, 'text-gain', 'Likely helps you']
      : d === 'negative' ? [TrendingDown, 'text-loss', 'Likely costs you']
      : [Minus, 'text-muted', 'Mixed or neutral effect'];
  return (
    <>
      <Icon className={`h-3 w-3 ${color}`} aria-hidden="true" />
      <span className="sr-only">{label}.</span>
    </>
  );
}

/** The user's own analysed estimate: sign, amount and words, never colour alone. */
function AnalysedAmount({ value }: { value: number }) {
  const sign = impactSign(value);
  const tone = sign === 'gain' ? 'text-gain' : sign === 'loss' ? 'text-loss' : 'text-muted';
  return (
    <span className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-meta">
      <span className="text-muted">Your estimate</span>
      <span className={cn('font-mono-data font-semibold', tone)}>{formatUSD(value, { signed: true, suffix: '/yr' })}</span>
      <span className={tone}>{impactWords(value)}</span>
    </span>
  );
}

export function PolicyChip({ policy, onAsk, onDragState }: {
  policy: RailPolicy;
  onAsk: (_p: RailPolicy) => void;
  /** Told when a drag of this chip starts and ends (the orb opens to receive it). */
  onDragState?: (_dragging: boolean) => void;
}) {
  return (
    <li
      draggable
      data-policy-chip={policy.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(POLICY_DRAG_TYPE, policy.id);
        e.dataTransfer.setData('text/plain', policy.title);
        e.dataTransfer.effectAllowed = 'copy';
        onDragState?.(true);
      }}
      onDragEnd={() => onDragState?.(false)}
      className={cn(
        'group relative mb-2 rounded-tile border border-fg/10 bg-surface p-3 transition-[border-color,box-shadow] duration-200 ease-civic',
        'hover:border-primary/30 hover:shadow-[0_0_0_1px_rgb(var(--c-violet)/0.12),0_16px_32px_-18px_rgb(var(--c-violet)/0.5)]',
        'focus-within:border-primary/40 [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing'
      )}
    >
      {/* A grip on mouse screens: these chips can be picked up. */}
      <GripVertical aria-hidden="true" className="absolute right-2 top-3 hidden h-3.5 w-3.5 text-muted/70 [@media(pointer:fine)]:block" />
      <span className="flex flex-wrap items-center gap-1.5 pr-5">
        {policy.relevanceScore !== undefined && (
          <span className={cn('rounded-full border px-1.5 text-meta', RELEVANCE_BADGE(policy.relevanceScore))}>
            <span className="sr-only">Relevance </span>
            <span className="font-mono-data">{policy.relevanceScore}</span>
            <span className="sr-only"> out of 100.</span>
            <span aria-hidden="true"> · {policy.relevance ?? relevanceBand(policy.relevanceScore)} relevance</span>
          </span>
        )}
        <span className="rounded-full border border-fg/10 bg-fg/5 px-1.5 text-meta capitalize text-muted">{policy.category.replace(/[-_]+/g, ' ')}</span>
        {/* The feed's guess only where there is no estimate of the user's own (which states its direction in words). */}
        {policy.analysedAnnual === undefined && <Direction d={policy.direction} />}
        {policy.source === 'analysis' && <span className="text-meta text-muted">Analyzed</span>}
      </span>
      <span className="mt-1.5 block text-sm font-medium leading-snug text-ink line-clamp-2">{policy.title}</span>
      {policy.analysedAnnual !== undefined ? (
        <AnalysedAmount value={policy.analysedAnnual} />
      ) : (
        policy.estimatedImpact && <span className="mt-1 block font-mono-data text-meta text-muted">{policy.estimatedImpact}</span>
      )}
      <button
        type="button"
        onClick={() => onAsk(policy)}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-300 transition-colors duration-200 ease-civic hover:border-primary/45 hover:bg-primary/15 hover:text-ink"
      >
        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Ask about this policy<span className="sr-only">: {policy.title}</span>
      </button>
    </li>
  );
}

export default function PolicyRail({ policies, loading, onAsk, onDragState, skeletons = 4 }: {
  policies: readonly RailPolicy[];
  loading: boolean;
  onAsk: (_p: RailPolicy) => void;
  onDragState?: (_dragging: boolean) => void;
  skeletons?: number;
}) {
  if (loading && policies.length === 0) {
    return (
      <div className="space-y-2">
        <span className="sr-only">Loading your policies…</span>
        {Array.from({ length: skeletons }, (_, i) => <div key={i} aria-hidden="true" className="h-24 rounded-tile bg-fg/5 motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (policies.length === 0) {
    return (
      <div className="p-4 text-center">
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-muted" aria-hidden="true" />
        <p className="text-xs text-muted">No policies in your feed yet. Visit your dashboard to generate one.</p>
      </div>
    );
  }
  return (
    <ul>
      {policies.map((p) => (
        <PolicyChip key={p.id} policy={p} onAsk={onAsk} onDragState={onDragState} />
      ))}
    </ul>
  );
}
