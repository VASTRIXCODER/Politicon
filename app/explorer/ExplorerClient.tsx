'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BarChart2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Button from '@/components/ui/Button';
import { BracketChart } from '@/components/landing/PublicExplorer';
import { createClient } from '@/lib/supabase/client';
import { CATEGORIES, type CategoryKey } from '@/lib/explorerData';

const PILL = 'flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium border transition-all';
const PILL_ON = 'bg-primary/20 border-primary/40 text-primary-300';
const PILL_OFF = 'bg-white/4 border-white/8 text-text-muted hover:text-text-primary';

/** The category filter and bracket chart: the interactive part of /explorer. */
export default function ExplorerClient() {
  const [selectedCat, setSelectedCat] = useState<CategoryKey | null>(null);

  const displayCats = selectedCat ? CATEGORIES.filter(c => c.key === selectedCat) : CATEGORIES;

  return (
    <>
      {/* Category filter pills (toggle buttons) */}
      <div role="group" aria-label="Filter by category" className="flex gap-3 mb-10 overflow-x-auto scrollbar-hide pb-2">
        <button type="button" aria-pressed={!selectedCat} onClick={() => setSelectedCat(null)} className={`${PILL} ${!selectedCat ? PILL_ON : PILL_OFF}`}>
          All categories
        </button>
        {CATEGORIES.map(cat => {
          const selected = selectedCat === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setSelectedCat(selected ? null : cat.key)}
              className={`${PILL} ${selected ? PILL_ON : PILL_OFF}`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main chart */}
      <GlassCard animate={false} className="rounded-3xl p-4 sm:p-8 mb-12">
        <div className="flex items-center gap-3 mb-8">
          <BarChart2 className="w-5 h-5 text-primary-300" aria-hidden="true" />
          <h2 className="font-display text-xl font-semibold text-text-primary">Example impact by income bracket</h2>
        </div>
        <BracketChart categories={displayCats} idPrefix="explorer-bracket" size="md" />
      </GlassCard>
    </>
  );
}

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  return signedIn;
}

/**
 * The closing call to action: sign up when signed out, back to the app when
 * signed in. `stateBills` says whether state bills are fetched (Open States is
 * configured), so the copy only promises them then.
 */
export function ExplorerCta({ stateBills = false }: { stateBills?: boolean }) {
  const signedIn = useSignedIn();
  const sources = stateBills ? 'Congress and state legislatures' : 'Congress';

  if (signedIn) {
    return (
      <>
        <p className="text-xs font-mono-data text-primary-300 uppercase tracking-widest mb-4">Your estimates</p>
        <h2 className="font-display text-3xl font-bold text-text-primary mb-4">
          See <span className="gradient-text">real bills</span> for your situation
        </h2>
        <p className="text-text-muted mb-8 max-w-lg mx-auto">
          Your dashboard lists official bills matched to your profile. Analyze any of them for an estimated dollar
          impact, with its assumptions and a confidence rating.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href="/dashboard" size="lg" icon={<ArrowRight className="w-4 h-4" />} iconPosition="end" className="rounded-2xl">
            Open my dashboard
          </Button>
          <Button href="/policies" variant="ghost" size="lg" className="rounded-2xl">
            Browse policies
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="text-xs font-mono-data text-primary-300 uppercase tracking-widest mb-4">Go deeper</p>
      <h2 className="font-display text-3xl font-bold text-text-primary mb-4">
        See estimates for <span className="gradient-text">your situation</span>
      </h2>
      <p className="text-text-muted mb-8 max-w-lg mx-auto">
        These are made-up examples. Create a free account, tell us about your household, and get AI estimates of how
        official bills from {sources} could affect you.
      </p>
      <Button href="/auth/signup" size="lg" icon={<ArrowRight className="w-4 h-4" />} iconPosition="end" className="rounded-2xl">
        Create free account
      </Button>
    </>
  );
}
