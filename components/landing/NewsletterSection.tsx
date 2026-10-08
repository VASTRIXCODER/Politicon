'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import Reveal from './Reveal';

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const SUCCESS = 'You’re on the list. Check your inbox for confirmation.';

/** Turns the API's `{ error: { code, message, retryAfter } }` into a sentence for the visitor. */
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const err = body?.error;
    if (res.status === 429) {
      const minutes = typeof err?.retryAfter === 'number' ? Math.ceil(err.retryAfter / 60) : null;
      return minutes
        ? `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
        : 'Too many attempts. Please try again later.';
    }
    if (typeof err?.message === 'string' && err.message) return err.message;
  } catch {
    // Not JSON; fall through.
  }
  return GENERIC_ERROR;
}

export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');
    setError('');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus('success');
      } else {
        setError(await errorMessage(res));
        setStatus('error');
      }
    } catch {
      setError('We couldn’t reach the server. Check your connection and try again.');
      setStatus('error');
    }
  };

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
            Weekly policy impact alerts
          </h2>
          <p className="text-text-muted text-lg mb-10">
            Get a digest of the week&apos;s highest-impact policies for your state — filtered to your income bracket. No noise, no politics, just dollars.
          </p>

          {/* Screen-reader announcements; the visible confirmation below repeats it. */}
          <p role="status" className="sr-only">
            {status === 'loading' ? 'Subscribing…' : status === 'success' ? SUCCESS : ''}
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
                  aria-invalid={status === 'error' || undefined}
                  aria-describedby={status === 'error' ? 'newsletter-error' : undefined}
                  className="input-glass flex-1 px-5 py-4 text-sm"
                />
                <Button
                  type="submit"
                  disabled={status === 'loading'}
                  icon={status === 'loading' ? undefined : <ArrowRight className="w-4 h-4" />}
                  iconPosition="end"
                  className="py-4 whitespace-nowrap"
                >
                  {status === 'loading' ? 'Subscribing...' : 'Subscribe'}
                </Button>
              </m.form>
            )}
          </AnimatePresence>

          <p id="newsletter-error" role="alert" className="text-negative text-sm [&:not(:empty)]:mt-3">
            {status === 'error' ? error || GENERIC_ERROR : ''}
          </p>

          <p className="text-xs text-text-muted mt-4">
            Weekly digest, every Sunday. Unsubscribe anytime. No spam.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
