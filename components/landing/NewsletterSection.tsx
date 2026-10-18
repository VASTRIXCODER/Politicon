'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { LogoMark } from '@/components/ui/Logo';
import { apiFetch, type ApiResult } from '@/lib/api';
import { SUPPORT_EMAIL } from '@/lib/legal';
import { cn } from '@/lib/utils';
import styles from './mockups/scenery.module.css';

// Nothing is emailed yet (no confirmation, digest or alerts), so the copy only
// promises what's true: the address is saved and we'll write when there's news.
const SUCCESS = 'You’re on the list. We’ll email you when there’s something new — no weekly digest yet.';

/** "in 12 minutes" style wait, from the API's retryAfter (seconds). */
function waitHint(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'a little while';
  if (seconds <= 60) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  return minutes >= 60 ? 'about an hour' : `${minutes} minutes`;
}

type Failure = Extract<ApiResult<unknown>, { ok: false }>;

/** A sentence for the visitor for each failure the API can return. */
function failureMessage(res: Failure): string {
  if (res.status === 400) return 'That doesn’t look like a valid email address. Check it and try again.';
  if (res.status === 429) return `Too many sign-up attempts from this connection. Please try again in ${waitHint(res.retryAfter)}.`;
  if (res.status === 0) return res.message; // network failure, already worded by apiFetch
  return 'We couldn’t add you to the list just now. Please try again later.';
}

/** The cancellation lines of a postmark, beside the stamp. Decorative. */
function Postmark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 64" aria-hidden="true" focusable="false" className={cn(styles.postmark, className)}>
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 3" />
      {[18, 28, 38, 48].map((y) => (
        <path
          key={y}
          d={`M64 ${y} q 12 -6 24 0 t 24 0 t 24 0 t 24 0`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/**
 * "Hear when there's something new": the mailing list, set as a postcard.
 * The message on the left, the address side on the right with a stamp and
 * a postmark, and the email field written on the address line.
 *
 * Status is announced through a polite live region (the visible
 * confirmation repeats it) and failures through role="alert", tied to the
 * field with aria-describedby. No animation library: the confirmation
 * rises in with a short CSS animation (instant under reduced motion).
 */
export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [failure, setFailure] = useState<{ message: string; invalidEmail: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');
    setFailure(null);

    const res = await apiFetch<{ success: true }>('/api/newsletter', { body: { email } });
    if (res.ok) {
      setStatus('success');
    } else {
      setFailure({ message: failureMessage(res), invalidEmail: res.status === 400 });
      setStatus('error');
    }
  };

  const showError = status === 'error' && failure !== null;

  return (
    <section aria-labelledby="newsletter-heading" data-scene-section="newsletter" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-fg/10 bg-surface shadow-pane">
          {/* A rim of violet light along the card's top edge. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
          />
          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* The message side. */}
            <div className="p-7 sm:p-12 lg:col-span-7 lg:p-14">
              <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
                <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
                Updates
              </p>
              <h2 id="newsletter-heading" className="mt-5 font-display text-display-sm font-medium text-ink">
                Hear when there&apos;s <em>something new.</em>
              </h2>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
                Leave your email and we&apos;ll let you know when Politicon adds something worth your time. There&apos;s
                no weekly digest or policy alert email yet.
              </p>
            </div>

            {/* The address side: stamp, postmark and the address line. */}
            <div className="relative border-t border-dashed border-fg/15 p-7 sm:p-12 lg:col-span-5 lg:border-l lg:border-t-0 lg:p-14">
              <div aria-hidden="true" data-decorative="" className="mb-8 flex items-start justify-end gap-2">
                <Postmark className="h-12 w-28 sm:h-14 sm:w-32" />
                <span className={cn(styles.stamp, 'grid h-16 w-14 flex-shrink-0 place-items-center sm:h-[4.5rem] sm:w-16')}>
                  <LogoMark className="h-8 w-8" detail="small" />
                </span>
              </div>

              {/* Screen-reader announcements; the visible confirmation below repeats it. */}
              <p role="status" className="sr-only">
                {status === 'loading' ? 'Adding you to the list…' : status === 'success' ? SUCCESS : ''}
              </p>

              {status === 'success' ? (
                <div aria-hidden="true" className={cn(styles.arrive, 'flex items-start gap-3 rounded-2xl border border-gain/25 bg-gain-fill/10 px-5 py-4')}>
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-gain" />
                  <p className="font-medium text-gain">{SUCCESS}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <label htmlFor="newsletter-email" className="block font-mono-data text-meta uppercase tracking-[0.16em] text-muted">
                    Email address
                  </label>
                  <input
                    id="newsletter-email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={(showError && failure.invalidEmail) || undefined}
                    aria-describedby={showError ? 'newsletter-error' : undefined}
                    className="input-glass w-full px-5 py-4 text-sm"
                  />
                  <Button
                    type="submit"
                    disabled={status === 'loading'}
                    fullWidth
                    icon={status === 'loading' ? undefined : <ArrowRight className="h-4 w-4" />}
                    iconPosition="end"
                    className="whitespace-nowrap"
                  >
                    {status === 'loading' ? 'Joining…' : 'Join the list'}
                  </Button>
                </form>
              )}

              <p id="newsletter-error" role="alert" className="text-sm text-danger [&:not(:empty)]:mt-3">
                {showError ? failure.message : ''}
              </p>

              <p className="mt-5 text-meta leading-relaxed text-muted">
                We use your address only for Politicon updates and never sell it. To be removed, email{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-300 underline underline-offset-2 hover:text-ink">
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
