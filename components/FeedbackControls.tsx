'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ThumbsUp, ThumbsDown, Flag } from 'lucide-react';
import { apiFetch } from '@/lib/api';

type Target = 'analysis' | 'feed_item' | 'chat_reply' | 'insight';
type Rating = 'up' | 'down' | 'not_relevant' | 'report';

/**
 * Thumbs up/down and "report a problem" on an AI output. A thumbs-down
 * offers the usual fixes (update profile, re-analyze) when they apply.
 * `excerpt` is a short copy of the rated text, kept with the feedback so
 * reviewers can see what was rated.
 */
export default function FeedbackControls({
  targetType, targetId, excerpt, onReanalyze, className = '',
}: { targetType: Target; targetId: string; excerpt?: string; onReanalyze?: () => void; className?: string }) {
  const [sent, setSent] = useState<Rating | null>(null);
  const [pending, setPending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);

  async function send(rating: Rating, why?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const res = await apiFetch<{ recorded?: boolean }>('/api/feedback', {
      body: {
        targetType, targetId, rating,
        ...(why ? { reason: why } : {}),
        ...(excerpt ? { excerpt: excerpt.slice(0, 1000) } : {}),
      },
    });
    inFlight.current = false;
    setPending(false);
    if (res.ok && res.data?.recorded === false && rating !== 'not_relevant') {
      // Feedback storage isn't set up yet; say so rather than thank the user for nothing.
      setError('Feedback isn’t available right now.');
    } else if (res.ok) {
      setSent(rating);
      setReporting(false);
    } else {
      setError(res.message);
    }
  }

  // The buttons give way to the thank-you note, so focus moves to it instead of dropping to <body>.
  useEffect(() => {
    if (sent) statusRef.current?.focus();
  }, [sent]);

  return (
    <div className={`text-meta text-text-muted ${className}`}>
      {!sent && (
        <>
          <div className="flex items-center gap-1">
            <span className="mr-1">Was this helpful?</span>
            <button type="button" onClick={() => send('up')} disabled={pending} aria-label="Helpful" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-emerald-400 transition-colors disabled:opacity-50">
              <ThumbsUp className="w-3.5 h-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => send('down')} disabled={pending} aria-label="Not helpful" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-red-300 transition-colors disabled:opacity-50">
              <ThumbsDown className="w-3.5 h-3.5" aria-hidden />
            </button>
            <button type="button" onClick={() => setReporting(v => !v)} disabled={pending} aria-expanded={reporting} aria-label="Report a problem" className="p-1.5 rounded-lg hover:bg-white/5 hover:text-amber-300 transition-colors disabled:opacity-50">
              <Flag className="w-3.5 h-3.5" aria-hidden />
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
              <button type="submit" disabled={pending} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-text-primary hover:bg-white/10 disabled:opacity-50">
                {pending ? 'Sending…' : 'Send report'}
              </button>
            </form>
          )}
        </>
      )}
      {/* Rendered from the start so screen readers announce the thank-you note when it appears. */}
      <div ref={statusRef} role="status" tabIndex={-1} className="outline-none">
        {sent && (
          <>
            Thanks for the feedback.
            {sent === 'down' && targetType === 'analysis' && (
              <span>
                {' '}If something looks off, you can{' '}
                <Link href="/settings" className="text-primary-300 hover:underline underline-offset-2">check your profile</Link>
                {onReanalyze && <> or <button type="button" onClick={onReanalyze} className="text-primary-300 hover:underline underline-offset-2">re-analyze</button></>}.
              </span>
            )}
          </>
        )}
      </div>
      {error && <p role="alert" className="mt-1 text-red-300">{error}</p>}
    </div>
  );
}
