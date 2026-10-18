import { ChevronDown } from 'lucide-react';
import type { ListedMember } from '@/lib/server/memberDirectory';

// Drawn in place of the hidden characters. Fixed text, so the blur never sits
// over (or hints at the length of) the real address.
const HIDDEN = 'xxxxxx';

function Hidden() {
  return (
    <span aria-hidden="true" className="select-none blur-[3px] opacity-70">
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
 * Dropdown under the member count. Addresses arrive already masked from the
 * server (lib/server/memberDirectory.ts); the blur is only decoration.
 */
export default function MemberList({ members }: { members: ListedMember[] }) {
  if (members.length === 0) return null;
  return (
    <details className="group mx-auto mt-10 max-w-md rounded-xl border border-white/10 bg-white/3 text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-text-primary hover:bg-white/4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        <span>See the member list</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="max-h-80 overflow-y-auto border-t border-white/10 px-4 py-2" aria-label="Members, newest first">
        {members.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-4 py-1.5 font-mono-data text-xs text-text-primary">
            <span>
              <span className="sr-only">Hidden email address starting with </span>
              {m.email.head}
              <Hidden />@{m.email.domainHead}
              <Hidden />
              {m.email.tld}
            </span>
            <span className="shrink-0 text-text-muted">{monthLabel(m.joined)}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-text-muted">
        Email addresses are partly hidden. Newest members first{members.length >= 1000 ? ', latest 1,000 shown' : ''}.
      </p>
    </details>
  );
}
