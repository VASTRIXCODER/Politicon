'use client';

import { useRef, useState, type RefObject } from 'react';
import { Send, X } from 'lucide-react';
import { POLICY_DRAG_TYPE, isPolicyDrag } from '@/components/guide/policyRail';
import { useToastClearance } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { MAX_TURN_CHARS, type PolicyMeta } from './types';

/**
 * The message box, pinned to the foot of the conversation: a solid night
 * pane (the whole pane shows the focus ring; the textarea draws none of its
 * own), Enter to send and Shift+Enter for a new line. A policy dragged from
 * the rail can be dropped here as well as on the orb. When a question was
 * prefilled for one of the user's policies (the dashboard's hand-off), a
 * token above the text says which, and can be removed. The page's toasts
 * rise clear of it (useToastClearance), so on a phone a toast never covers
 * the box.
 */
export default function Composer({ value, onChange, onSubmit, disabled, inputRef, pendingPolicy, onClearPolicy, onDropPolicy }: {
  value: string;
  onChange: (_v: string) => void;
  onSubmit: () => void;
  /** A reply is on its way: sending waits. */
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  pendingPolicy: PolicyMeta | null;
  onClearPolicy: () => void;
  /** A policy id dropped on the composer. */
  onDropPolicy: (_id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useToastClearance(boxRef);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSubmit(); }
  };

  return (
    <div
      ref={boxRef}
      onDragOver={(e) => {
        // Only a policy from the rail is taken here; dragged text still drops into the box as usual.
        if (!isPolicyDrag(e.dataTransfer.types)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!isPolicyDrag(e.dataTransfer.types)) return;
        e.preventDefault();
        setDragOver(false);
        onDropPolicy(e.dataTransfer.getData(POLICY_DRAG_TYPE));
      }}
      className={cn(
        'relative mt-3 rounded-[1.25rem] border border-fg/12 bg-raised p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.07),0_24px_48px_-24px_rgb(0_0_0/0.9)] transition-[border-color,box-shadow] duration-200 ease-civic',
        'has-[textarea:focus-visible]:border-primary-300 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-primary-300/60',
        dragOver && 'border-primary/60 ring-2 ring-primary/35'
      )}
    >
      {/* A rim of violet light along the top edge. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent" />
      {pendingPolicy && (
        <div className="mb-2 flex min-w-0 items-center gap-2 pl-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 py-1 pl-3 pr-1 text-meta text-ink">
            <span className="flex-shrink-0 text-muted">About</span>
            <span className="min-w-0 truncate font-medium">{pendingPolicy.policyTitle}</span>
            <button
              type="button"
              onClick={onClearPolicy}
              aria-label={`Don’t ask about ${pendingPolicy.policyTitle}`}
              className="flex-shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-fg/8 hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}
      <div className="flex items-end gap-3">
        <textarea
          ref={inputRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label="Message the Policy Guide"
          onKeyDown={handleKeyDown}
          placeholder={dragOver ? 'Drop a policy here to ask about it…' : 'Ask about any policy and how it affects your finances…'}
          rows={1}
          maxLength={MAX_TURN_CHARS}
          className="max-h-32 min-w-0 flex-1 resize-none bg-transparent py-1.5 pl-1 text-sm text-ink placeholder:text-muted outline-none"
          style={{ minHeight: '28px' }}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-fill shadow-[0_0_0_1px_rgb(var(--c-glow)/0.35),0_8px_24px_-8px_rgb(var(--c-violet)/0.8)] transition-[background-color,opacity] duration-200 ease-civic hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4 text-white" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
