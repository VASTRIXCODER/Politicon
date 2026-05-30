'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, CheckCircle, ArrowRight } from 'lucide-react';

export default function NewsletterSection() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || status === 'loading') return;
    setStatus('loading');

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setStatus('success');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-primary/4 to-secondary/6" />
      <div className="absolute inset-x-0 h-px top-0 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/20 mb-8">
            <Mail className="w-6 h-6 text-primary" />
          </div>

          <h2 className="font-display text-4xl font-bold text-text-primary mb-4">
            Weekly policy impact alerts
          </h2>
          <p className="text-text-muted text-lg mb-10">
            Get a digest of the week&apos;s highest-impact policies for your state — filtered to your income bracket. No noise, no politics, just dollars.
          </p>

          <AnimatePresence mode="wait">
            {status === 'success' ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center justify-center gap-3 glass rounded-2xl px-8 py-4"
              >
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <p className="text-emerald-400 font-medium">You&apos;re on the list. Check your inbox for confirmation.</p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
              >
                <input
                  type="email"
                  required
                  placeholder="Enter your email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-glass flex-1 px-5 py-4 text-sm"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="bg-primary hover:bg-primary/90 text-white px-6 py-4 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-60"
                >
                  {status === 'loading' ? 'Subscribing...' : (
                    <>
                      Subscribe <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {status === 'error' && (
            <p className="text-red-400 text-sm mt-3">Something went wrong. Please try again.</p>
          )}

          <p className="text-xs text-text-muted mt-4">
            Weekly digest, every Sunday. Unsubscribe anytime. No spam.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
