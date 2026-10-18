import Badge from '@/components/ui/Badge';
import { BRACKETS, EXAMPLE_POLICIES, formatAnnual } from '@/lib/explorerData';
import { cn } from '@/lib/utils';
import { AuthNightPanel, AuthSealView } from './AuthStage';
import SealPoster from './SealPoster';

/*
 * The cinematic half of the sign-in and sign-up pages (lg and up): a night
 * pane with a short, honest statement, the glass seal pressed into a bill,
 * a small example ledger and three plain principles. Server-rendered; only
 * the seal's 3D view and the pane's night switch are client code.
 */

const COPY = {
  signin: {
    title: (
      <>
        The record, <em>in your terms</em>.
      </>
    ),
    lede: 'Pick up where you left off: real bills from the official record, each explained in plain dollars for a household like yours.',
  },
  signup: {
    title: (
      <>
        See what a bill <em>means for you</em>.
      </>
    ),
    lede: 'Answer a few questions in ranges. Politicon matches you with real bills and estimates their effect on your budget, with every assumption shown.',
  },
} as const;

const PRINCIPLES = [
  { title: 'Real bills', body: 'Federal records from Congress.gov' },
  { title: 'Non-partisan', body: 'No candidates, parties or ballot advice' },
  { title: 'Ranges only', body: 'Never your exact income or balances' },
];

/**
 * One gain and one cost for the same sample household, from the explorer's
 * illustrative dataset (so the figures match the explorer), never a real
 * bill and always labelled as an example.
 */
function exampleLedger() {
  const bracket = BRACKETS[1];
  const gain = EXAMPLE_POLICIES.find((p) => p.annualByBracket[bracket.key] > 0);
  const cost = EXAMPLE_POLICIES.find((p) => p.annualByBracket[bracket.key] < 0);
  const rows = [gain, cost].flatMap((p) => (p ? [{ title: p.title, amount: p.annualByBracket[bracket.key] }] : []));
  return { bracket: bracket.label, rows };
}

function ExampleLedger({ className }: { className?: string }) {
  const { bracket, rows } = exampleLedger();
  if (!rows.length) return null;
  return (
    // A paper slip on the night pane (a light island), tipped as if set down on it.
    <div data-day="" className={cn('w-[17.5rem] rotate-[-2.5deg] rounded-tile bg-raised p-4 text-ink shadow-lift ring-1 ring-fg/10', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono-data text-meta uppercase tracking-[0.14em] text-muted">Sample household</p>
        <Badge variant="example">Example</Badge>
      </div>
      <p className="mt-1 text-meta text-muted">{bracket} income</p>
      <ul className="mt-3 border-t border-dashed border-fg/20">
        {rows.map((row) => (
          <li key={row.title} className="flex items-start justify-between gap-3 border-b border-dashed border-fg/20 py-2.5">
            <span className="text-sm leading-snug">{row.title}</span>
            <span className="flex-shrink-0 text-right">
              <span className={cn('block font-mono-data text-sm font-semibold', row.amount < 0 ? 'text-loss' : 'text-gain')}>
                {formatAnnual(row.amount)}
              </span>
              <span className="block text-meta text-muted">{row.amount < 0 ? 'could cost' : 'could save'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-meta text-muted">Hypothetical policies, illustrative figures.</p>
    </div>
  );
}

export default function AuthPanel({ kind }: { kind: keyof typeof COPY }) {
  const copy = COPY[kind];
  return (
    <AuthNightPanel className="flex h-full flex-col rounded-[1.75rem] px-10 pb-9 pt-10 xl:px-12">
      <p className="inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
        <span
          aria-hidden="true"
          data-decorative=""
          className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)]"
        />
        Educational estimates · Not advice
      </p>
      <h2 className="mt-6 max-w-[30rem] font-display text-display-sm font-medium text-ink">{copy.title}</h2>
      <p className="mt-4 max-w-[30rem] text-base leading-relaxed text-muted [text-wrap:pretty]">{copy.lede}</p>

      {/* The seal fills what's left, set right of centre so the ledger slip can rest at its lower left
          (on screens tall enough for both; otherwise the seal takes the whole stage). */}
      <div className="relative mt-4 min-h-0 flex-1">
        <AuthSealView poster={<SealPoster />} className="absolute inset-y-0 right-0 w-[74%] [@media(max-height:760px)]:w-full" />
        <ExampleLedger className="absolute bottom-3 left-0 [@media(max-height:760px)]:hidden" />
      </div>

      <ul className="mt-4 grid grid-cols-3 gap-6 border-t border-fg/10 pt-5">
        {PRINCIPLES.map((p, i) => (
          <li key={p.title}>
            <p className="font-mono-data text-meta text-primary-300">{String(i + 1).padStart(2, '0')}</p>
            <p className="mt-1 text-sm font-medium text-ink">{p.title}</p>
            <p className="mt-0.5 text-meta leading-snug text-muted">{p.body}</p>
          </li>
        ))}
      </ul>
    </AuthNightPanel>
  );
}
