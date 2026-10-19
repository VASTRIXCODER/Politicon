import { ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { formatRecordDate } from '@/lib/recordDate';
import type { PolicyRecord } from '@/types';

const SOURCE_LABEL: Record<string, string> = {
  'congress.gov': 'Congress.gov',
  openstates: 'Open States',
};

/**
 * Where a policy's facts come from: the official record (with its latest
 * action, when it was captured and a link), or a clear note that it wasn't
 * verified. With snapshotLabel the latest action is labelled as the status
 * when the analysis was made, since an analysis keeps the record it was based on.
 * The record's shield is archive gold, the colour kept for official records;
 * the unverified note is neutral ink (a note on the source, not a warning).
 * Dates print the same on the server and in any time zone.
 */
export default function PolicyProvenance({ record, compact = false, snapshotLabel = false }: {
  record?: PolicyRecord; compact?: boolean; snapshotLabel?: boolean;
}) {
  if (!record || !record.verified) {
    return (
      <p className="flex items-start gap-1.5 text-meta text-muted">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden />
        <span>Not verified against an official source{compact ? '' : ' — details may be incomplete or out of date. Check the official record before relying on it.'}</span>
      </p>
    );
  }
  const date = formatRecordDate(record.latestActionDate);
  const asOf = compact ? null : formatRecordDate(record.asOf);
  const source = SOURCE_LABEL[record.source] || record.source;
  // Only link to https pages; anything else is shown as plain text.
  const href = record.sourceUrl?.startsWith('https://') ? record.sourceUrl : null;
  return (
    <div className="text-meta text-muted space-y-1">
      {record.latestAction && (
        <p className={compact ? 'line-clamp-2' : ''}>
          {snapshotLabel ? (
            <><span className="text-ink/80">Status when analyzed:</span> {record.latestAction}{date ? ` (${date})` : ''}</>
          ) : (
            <><span className="text-ink/80">Latest action{date ? ` (${date})` : ''}:</span> {record.latestAction}</>
          )}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-gold flex-shrink-0" aria-hidden />
        <span>Official record:</span>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-300 underline decoration-primary/30 underline-offset-2 hover:decoration-primary">
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
