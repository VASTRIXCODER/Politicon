'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';

/**
 * Whether this browser has a Supabase session. Starts signed out and stays
 * that way if auth can't be reached, so the sign-up CTA is the fallback; the
 * app routes still check auth themselves.
 */
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return; // Misconfigured env: keep the sign-up CTA.
    }
    // Fires INITIAL_SESSION straight away, then on every sign-in/out.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  return signedIn;
}

/**
 * The closing call to action, in the night pane at the foot of /explorer:
 * a personal report when signed out, back to the app when signed in.
 * `stateBills` says whether state bills are fetched (Open States is
 * configured), so the copy only promises them then.
 */
export default function ExplorerCta({ stateBills = false }: { stateBills?: boolean }) {
  const signedIn = useSignedIn();
  const sources = stateBills ? 'Congress and state legislatures' : 'Congress';

  if (signedIn) {
    return (
      <>
        <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-primary-300">Your estimates</p>
        <h2 id="explorer-cta-heading" className="mt-5 font-display text-display-sm font-medium text-ink [text-wrap:balance]">
          See <em>real bills</em> for your situation
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted">
          Your dashboard lists official bills matched to your profile. Analyze any of them for an estimated dollar impact,
          with its assumptions and a confidence rating.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Button href="/dashboard" size="lg" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
            Open my dashboard
          </Button>
          <Button href="/policies" variant="ghost" size="lg">
            Browse policies
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-primary-300">Go from examples to estimates</p>
      <h2 id="explorer-cta-heading" className="mt-5 font-display text-display-sm font-medium text-ink [text-wrap:balance]">
        Your household, <em>your bills</em>
      </h2>
      <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted">
        These are made-up examples. Create a free account, tell us about your household, and get AI estimates of how official
        bills from {sources} could affect you, each with its assumptions and a confidence rating.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Button href="/auth/signup" size="lg" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
          Start your free report
        </Button>
        <Button href="/auth/signin" variant="ghost" size="lg">
          Sign in
        </Button>
      </div>
    </>
  );
}
