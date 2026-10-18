import { ArrowRight } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FILM_SHOTS } from '@/lib/three/film';
import type { FilmShot, LedgerLine } from './shots';

/** The example's savings and costs, each added up, with the words that say which way they go. */
function ledgerSummary(lines: LedgerLine[]): { direction: string; amount: number }[] {
  const saves = lines.filter((l) => l.amount >= 0).reduce((sum, l) => sum + l.amount, 0);
  const costs = lines.filter((l) => l.amount < 0).reduce((sum, l) => sum + l.amount, 0);
  return [
    ...(saves ? [{ direction: 'Saves you', amount: saves }] : []),
    ...(costs ? [{ direction: 'Costs you', amount: costs }] : []),
  ];
}

/**
 * One shot's caption: the real "how it works" copy, set editorially (a mono
 * step numeral on a hairline, a Fraunces title with its italic accent, the
 * body, then tags, the example ledger or the next steps). Rendered on the
 * server once and placed by FilmPlayer, either as a panel of the static
 * sequence or over the pinned film.
 */
export default function FilmCaption({ shot, index, className }: { shot: FilmShot; index: number; className?: string }) {
  const titleId = `film-shot-${shot.id}`;
  return (
    <article aria-labelledby={titleId} className={cn('max-w-[30rem]', className)}>
      <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
        <span aria-hidden="true" className="text-primary-300">{shot.numeral}</span>
        <span aria-hidden="true" className="h-px w-8 bg-fg/20" />
        <span>
          <span className="sr-only">Step {index + 1} of {FILM_SHOTS}: </span>
          {shot.kicker}
        </span>
      </p>
      <h3 id={titleId} data-caption-title="" className="mt-5 font-display text-display-sm font-medium text-ink">
        {shot.title.lead} <em>{shot.title.accent}</em>
      </h3>
      <p data-caption-body="" className="mt-4 text-base leading-relaxed text-muted sm:text-[1.0625rem]">
        {shot.body}
      </p>

      {shot.tags && (
        <ul data-caption-extra="" className="mt-6 flex flex-wrap gap-2" aria-label={shot.id === 'record' ? 'Sources' : undefined}>
          {shot.tags.map((tag) => (
            <li
              key={tag.text}
              className="inline-flex items-center gap-2 rounded-full border border-fg/12 bg-raised/60 px-3 py-1 font-mono-data text-meta text-muted"
            >
              {/* Archive gold marks the official record, and nothing else. */}
              {tag.record && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />}
              <span className={cn(tag.record && 'text-ink')}>{tag.text}</span>
            </li>
          ))}
        </ul>
      )}

      {shot.example && (
        // Numbers sit on a solid pane, never on the moving scene.
        <figure className="mt-6 max-w-sm rounded-tile border border-fg/10 bg-raised p-4 shadow-pane">
          <figcaption className="flex items-center justify-between gap-3">
            <Badge variant="example">Example</Badge>
            <span className="font-mono-data text-meta text-muted">Sample household</span>
          </figcaption>
          <dl className="mt-3 space-y-1.5 font-mono-data text-sm">
            {shot.example.lines.map((line) => (
              <div key={line.label} data-caption-line="" className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">
                  {line.direction} <span className="text-ink">· {line.label}</span>
                </dt>
                <dd className={line.amount < 0 ? 'text-loss' : 'text-gain'}>{formatUSD(line.amount, { signed: true })}</dd>
              </div>
            ))}
            {/* The same lines in two, for the pinned film on phones and short
                screens (film.module.css swaps them in): the costs never drop out. */}
            {ledgerSummary(shot.example.lines).map((row) => (
              <div key={row.direction} data-caption-summary="" className="hidden items-baseline justify-between gap-4">
                <dt className="text-muted">{row.direction}</dt>
                <dd className={row.amount < 0 ? 'text-loss' : 'text-gain'}>{formatUSD(row.amount, { signed: true, suffix: '/yr' })}</dd>
              </div>
            ))}
            <div className="!mt-3 flex items-baseline justify-between gap-4 border-t border-dashed border-fg/15 pt-3">
              <dt className="font-body text-sm font-medium text-ink">{shot.example.totalWords}</dt>
              <dd className={cn('text-2xl font-semibold', shot.example.total < 0 ? 'text-loss' : 'text-gain')}>
                {formatUSD(shot.example.total, { signed: true, suffix: '/yr' })}
              </dd>
            </div>
          </dl>
          <p data-caption-extra="" className="mt-3 text-meta text-muted">
            {shot.example.note}
          </p>
        </figure>
      )}

      {shot.links && (
        <div className="mt-8 flex flex-wrap gap-3">
          {shot.links.map((link) => (
            <Button
              key={link.href}
              href={link.href}
              variant={link.primary ? 'primary' : 'ghost'}
              icon={link.primary ? <ArrowRight className="h-4 w-4" /> : undefined}
              iconPosition="end"
            >
              {link.text}
            </Button>
          ))}
        </div>
      )}
    </article>
  );
}

/**
 * The same step as plain text, for screen readers while the pinned film
 * shows one caption at a time (FilmStage): its number, title, body, tags
 * and example figures, with no links (the visible caption keeps those, so
 * focus never lands on something unseen). Server-rendered with the captions.
 */
export function FilmTranscript({ shot, index }: { shot: FilmShot; index: number }) {
  return (
    <>
      <h3>
        Step {index + 1} of {FILM_SHOTS}: {shot.title.lead} {shot.title.accent}
      </h3>
      <p>{shot.body}</p>
      {shot.tags && <p>{shot.tags.map((tag) => tag.text).join(', ')}.</p>}
      {shot.example && (
        <p>
          Example, a sample household:{' '}
          {shot.example.lines
            .map((line) => `${line.direction.toLowerCase()} ${formatUSD(line.amount, { signed: true })} a year, ${line.label}`)
            .join('; ')}
          . {shot.example.totalWords}: {formatUSD(shot.example.total, { signed: true, suffix: '/yr' })}. {shot.example.note}
        </p>
      )}
    </>
  );
}
