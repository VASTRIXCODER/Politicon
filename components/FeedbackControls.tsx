'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Flag } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Target = 'analysis' | 'feed_item' | 'chat_reply' | 'insight';
type Rating = 'up' | 'down' | 'not_relevant' | 'report';

/**
 * Thumbs up/down and "report a problem" on an AI output. A thumbs-down
 * offers the usual fixes (update profile, re-analyze) when they apply.
 */
export default function FeedbackControls({
  targetType, targetId, onReanalyze, className = '',
}: { targetType: Target; targetId: string; onReanalyze?: () => void; className?: string }) {
  const [sent, setSent] = useState<Rating | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send(rating: Rating, why?: string) {
    setError(null);
    const res = await apiFetch('/api/feedback', { body: { targetType, targetId, rating, ...(why ? { reason: why } : {}) } });
    if (res.ok) {
      setSent(rating);
      setReporting(false);
    } else {
      setError(res.message);
    }
  }

  if (sent) {
    return (
      <div className={`text-[11px] text-text-muted ${className}`} role="status">
        Thanks for the feedback.
        {sent === 'down' && targetType === 'analysis' && (
          <span>
            {' '}If something looks off, you can{' '}
            <a href="/settings" className="text-primary hover:underline underline-offset-2">check your profile</a>
            {onReanalyze && <> or <button onClick={onReanalyze} className="text-primary hover:underline underline-offset-2">re-analyze</button></>}.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`text-[11px] text-text-muted ${className}`}>
      <div className="flex items-center gap-1">
        <span className="mr-1">Was this helpful?</span>
        <button onClick={() => send('up')} aria-label="Helpful" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-emerald-400 transition-colors">
          <ThumbsUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => send('down')} aria-label="Not helpful" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-red-300 transition-colors">
          <ThumbsDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setReporting(v => !v)} aria-expanded={reporting} aria-label="Report a problem" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-amber-300 transition-colors">
          <Flag className="w-3.5 h-3.5" />
        </button>
      </div>
      {reporting && (
        <form
          onSubmit={(e) => { e.preventDefault(); send('report', reason.trim() || undefined); }}
          className="mt-2 flex flex-col sm:flex-row gap-2"
        >
          <label htmlFor={`report-${targetId}`} className="sr-only">What&apos;s wrong?</label>
          <input
            id={`report-${targetId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            placeholder="What's wrong? (e.g. outdated, inaccurate, biased)"
            className="input-glass flex-1 px-3 py-2 text-base sm:text-xs rounded-lg"
          />
          <button type="submit" className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-primary hover:bg-white/10">Send report</button>
        </form>
      )}
      {error && <p role="alert" className="mt-1 text-red-300">{error}</p>}
    </div>
  );
}
