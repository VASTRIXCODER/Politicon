import { ChevronDown } from 'lucide-react';
import type { ListedMember } from '@/lib/server/memberDirectory';

// Drawn in place of the hidden characters. Fixed text, so the blur never sits
// over (or hints at the length of) the real address.
const HIDDEN = 'xxxxxx';

function Hidden() {
  return (
    <span aria-hidden="true" className="select-none text-muted blur-[3px]">
      {HIDDEN}
    </span>
  );
}

function monthLabel(joined: string): string {
  const [y, m] = joined.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Dropdown under the member count, set like a page torn from the ledger.
 * Addresses arrive already masked from the server
 * (lib/server/memberDirectory.ts); the blur is only decoration.
 */
export default function MemberList({ members }: { members: ListedMember[] }) {
  if (members.length === 0) return null;
  return (
    <details className="group mt-8 max-w-md rounded-tile border border-fg/10 bg-raised/70 text-left shadow-pane">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-tile px-4 py-3 text-sm font-medium text-ink transition-colors hover:bg-fg/[0.04] [&::-webkit-details-marker]:hidden">
        <span>See the member list</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 text-muted transition-transform duration-300 ease-civic group-open:rotate-180" />
      </summary>
      <ul className="max-h-80 divide-y divide-fg/[0.06] overflow-y-auto border-t border-fg/10 px-4 py-1" aria-label="Members, newest first">
        {members.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-4 py-2 font-mono-data text-xs text-ink">
            <span>
              <span className="sr-only">Hidden email address starting with </span>
              {m.email.head}
              <Hidden />@{m.email.domainHead}
              <Hidden />
              {m.email.tld}
            </span>
            <span className="shrink-0 text-muted">{monthLabel(m.joined)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-fg/10 px-4 py-2.5 text-meta text-muted">
        Email addresses are partly hidden. Newest members first{members.length >= 1000 ? ', latest 1,000 shown' : ''}.
      </p>
    </details>
  );
}
