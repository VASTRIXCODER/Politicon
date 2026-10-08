'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { apiFetch, type ApiResult } from '@/lib/api';
import { SUPPORT_EMAIL } from '@/lib/legal';
import Reveal from './Reveal';

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
    <section aria-labelledby="newsletter-heading" className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-primary/4 to-secondary/6" />
      <div className="absolute inset-x-0 h-px top-0 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <Reveal className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/20 mb-8" aria-hidden="true">
            <Mail className="w-6 h-6 text-primary" />
          </div>

          <h2 id="newsletter-heading" className="font-display text-4xl font-bold text-text-primary mb-4">
            Hear when there&apos;s something new
          </h2>
          <p className="text-text-muted text-lg mb-10">
            Leave your email and we&apos;ll let you know when Politicon adds something worth your time. There&apos;s no weekly digest or policy alert email yet.
          </p>

          {/* Screen-reader announcements; the visible confirmation below repeats it. */}
          <p role="status" className="sr-only">
            {status === 'loading' ? 'Adding you to the list…' : status === 'success' ? SUCCESS : ''}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            {status === 'success' ? (
              <m.div
                key="success"
                aria-hidden="true"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-3 glass rounded-2xl px-8 py-4"
              >
                <CheckCircle className="w-5 h-5 text-positive" />
                <p className="text-positive font-medium">{SUCCESS}</p>
              </m.div>
            ) : (
              <m.form
                key="form"
                onSubmit={handleSubmit}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              >
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  aria-invalid={(showError && failure.invalidEmail) || undefined}
                  aria-describedby={showError ? 'newsletter-error' : undefined}
                  className="input-glass flex-1 px-5 py-4 text-sm"
                />
                <Button
                  type="submit"
                  disabled={status === 'loading'}
                  icon={status === 'loading' ? undefined : <ArrowRight className="w-4 h-4" />}
                  iconPosition="end"
                  className="py-4 whitespace-nowrap"
                >
                  {status === 'loading' ? 'Joining…' : 'Join the list'}
                </Button>
              </m.form>
            )}
          </AnimatePresence>

          <p id="newsletter-error" role="alert" className="text-negative text-sm [&:not(:empty)]:mt-3">
            {showError ? failure.message : ''}
          </p>

          <p className="text-meta text-text-muted mt-4">
            We use your address only for Politicon updates and never sell it. To be removed, email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary-300 hover:underline">{SUPPORT_EMAIL}</a>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
