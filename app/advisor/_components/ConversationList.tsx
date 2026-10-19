import { Clock, MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession } from './types';

/**
 * The saved conversations, newest first: open one, or delete it (the page
 * asks first). Shared by the side panel (tablets and up) and the bottom
 * sheet (phones).
 */
export default function ConversationList({ sessions, loading, activeId, onOpen, onDelete }: {
  sessions: readonly ChatSession[];
  loading: boolean;
  activeId: string | null;
  onOpen: (_s: ChatSession) => void;
  onDelete: (_s: ChatSession) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        <span className="sr-only">Loading conversations…</span>
        {[0, 1, 2, 3].map(i => <div key={i} aria-hidden="true" className="h-14 rounded-xl bg-fg/5 motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="p-4 text-center">
        <MessageSquare className="mx-auto mb-2 h-6 w-6 text-muted" aria-hidden="true" />
        <p className="text-xs text-muted">No conversations yet. Start chatting!</p>
      </div>
    );
  }
  return (
    <ul>
      {sessions.map(session => {
        const active = activeId === session.id;
        return (
          <li
            key={session.id}
            className={cn(
              'group relative mb-1 rounded-xl border transition-colors duration-200 ease-civic',
              active ? 'border-primary/25 bg-primary/15' : 'border-transparent hover:bg-fg/5'
            )}
          >
            {/* The open conversation is marked by more than colour: a bar of light at its edge. */}
            {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary-300" />}
            <button type="button" onClick={() => onOpen(session)} aria-current={active || undefined} className="w-full rounded-xl p-3 pr-10 text-left">
              <span className="block truncate text-xs font-medium text-ink">{session.title}</span>
              <span className="mt-1 flex items-center gap-1">
                <Clock className="h-2.5 w-2.5 text-muted" aria-hidden="true" />
                <span className="text-meta text-muted">{new Date(session.updated_at || session.created_at).toLocaleDateString()}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(session)}
              aria-label={`Delete conversation “${session.title}”`}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted transition-[opacity,color,background-color] duration-200 ease-civic hover:bg-danger/10 hover:text-danger focus:opacity-100 group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
