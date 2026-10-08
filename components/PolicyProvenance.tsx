import { ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { PolicyRecord } from '@/types';

const SOURCE_LABEL: Record<string, string> = {
  'congress.gov': 'Congress.gov',
  openstates: 'Open States',
};

function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  const date = new Date(`${d.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Where a policy's facts come from: the official record (with its latest
 * action, when it was captured and a link), or a clear note that it wasn't
 * verified. With snapshotLabel the latest action is labelled as the status
 * when the analysis was made, since an analysis keeps the record it was based on.
 */
export default function PolicyProvenance({ record, compact = false, snapshotLabel = false }: {
  record?: PolicyRecord; compact?: boolean; snapshotLabel?: boolean;
}) {
  if (!record || !record.verified) {
    return (
      <p className="flex items-start gap-1.5 text-meta text-amber-300/90">
        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden />
        <span>Not verified against an official source{compact ? '' : ' — details may be incomplete or out of date. Check the official record before relying on it.'}</span>
      </p>
    );
  }
  const date = formatDate(record.latestActionDate);
  const asOf = compact ? null : formatDate(record.asOf);
  const source = SOURCE_LABEL[record.source] || record.source;
  // Only link to https pages; anything else is shown as plain text.
  const href = record.sourceUrl?.startsWith('https://') ? record.sourceUrl : null;
  return (
    <div className="text-meta text-text-muted space-y-1">
      {record.latestAction && (
        <p className={compact ? 'line-clamp-1' : ''}>
          {snapshotLabel ? (
            <><span className="text-text-primary/80">Status when analyzed:</span> {record.latestAction}{date ? ` (${date})` : ''}</>
          ) : (
            <><span className="text-text-primary/80">Latest action{date ? ` (${date})` : ''}:</span> {record.latestAction}</>
          )}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden />
        <span>Official record:</span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-300 hover:underline underline-offset-2">
            {source} <ExternalLink className="w-3 h-3" aria-hidden /><span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span>{source}</span>
        )}
        {asOf && <span>· as of {asOf}</span>}
      </p>
    </div>
  );
}
