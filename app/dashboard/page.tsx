'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Bell, ArrowRight, TrendingUp, AlertCircle, Lightbulb, Info, BookOpen, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mockPolicies, mockInsights, mockNews } from '@/mocks/policies';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import Navbar from '@/components/layout/Navbar';
import AmbientBackground from '@/components/landing/AmbientBackground';
import { getStatusColor, getCategoryIcon, timeAgo } from '@/lib/utils';

const insightIcons = { alert: AlertCircle, opportunity: Lightbulb, trend: TrendingUp, info: Info };
const insightColors = { alert: 'text-amber-400', opportunity: 'text-emerald-400', trend: 'text-secondary', info: 'text-text-muted' };

export default function DashboardPage() {
  const [firstName, setFirstName] = useState('there');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.first_name) setFirstName(user.user_metadata.first_name);
      setLoading(false);
    });
  }, []);

  const netImpact = 6420;
  const trackedCount = mockInsights.length;

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />
      <div className="relative z-10">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">

          {/* Greeting */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex items-center justify-between mb-10">
            <div>
              <h1 className="font-display text-3xl font-bold text-text-primary">
                Good {getGreeting()}, <span className="gradient-text capitalize">{firstName}</span>
              </h1>
              <p className="text-text-muted text-sm mt-1">Here&apos;s what&apos;s affecting your wallet today.</p>
            </div>
            <button className="relative glass p-3 rounded-xl hover:border-white/16 transition-all">
              <Bell className="w-5 h-5 text-text-muted" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </motion.div>

          {/* Net impact hero card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
            className="glass-strong rounded-3xl p-8 mb-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/5" />
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-3">Net Annual Impact — All Tracked Policies</p>
                  <div className="font-mono-data text-5xl sm:text-6xl font-bold gradient-text-gold">
                    +$<AnimatedCounter end={netImpact} duration={2000} />/yr
                  </div>
                  <p className="text-text-muted text-sm mt-2">
                    Across {trackedCount} policies tracked for your profile
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <Link href="/policies">
                    <button className="flex items-center gap-2 bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary px-5 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap">
                      Discover more policies <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                  <Link href="/impact">
                    <button className="flex items-center gap-2 glass hover:border-white/16 text-text-muted px-5 py-3 rounded-xl text-sm transition-all whitespace-nowrap">
                      View full dashboard <ArrowRight className="w-4 h-4" />
                    </button>
                  </Link>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-white/8">
                {[
                  { label: 'Highest gain', value: '+$3,750', sub: 'Housing credit' },
                  { label: 'Biggest risk', value: '-$340/mo', sub: 'Capital gains' },
                  { label: 'Policies tracked', value: trackedCount.toString(), sub: 'View all' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="font-mono-data text-lg font-bold text-text-primary">{s.value}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main: AI-discovered policies */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-semibold text-text-primary">AI-Discovered Policies</h2>
                <Link href="/policies" className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="space-y-4">
                {mockPolicies.slice(0, 5).map((policy, i) => {
                  const mainImpact = policy.impacts[0];
                  return (
                    <GlassCard key={policy.id} delay={i * 0.07} className="rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">{getCategoryIcon(policy.category)}</span>
                            <Badge variant="default">{policy.category}</Badge>
                            <Badge variant={policy.status === 'enacted' ? 'success' : policy.status === 'proposed' ? 'warning' : 'primary'}>
                              {policy.status}
                            </Badge>
                          </div>
                          <h3 className="font-medium text-text-primary text-sm leading-snug mb-1">{policy.title}</h3>
                          <p className="text-xs text-text-muted line-clamp-1">{policy.summary}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`font-mono-data text-sm font-bold ${
                            mainImpact.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {mainImpact.direction === 'positive' ? '+' : ''}{mainImpact.value}{mainImpact.unit.includes('$') ? '' : ' '}{mainImpact.unit}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5">{mainImpact.label}</p>
                          <Link href={`/policies?id=${policy.id}`}>
                            <button className="mt-2 text-[10px] text-primary hover:text-primary/80">Analyze →</button>
                          </Link>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Insights */}
              <div>
                <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Your Insights</h2>
                <div className="space-y-3">
                  {mockInsights.map((insight, i) => {
                    const Icon = insightIcons[insight.type];
                    return (
                      <GlassCard key={insight.id} delay={i * 0.08} className="rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                          <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${insightColors[insight.type]}`} />
                          <div>
                            <p className="text-xs font-medium text-text-primary mb-1">{insight.title}</p>
                            <p className="text-[11px] text-text-muted leading-relaxed">{insight.summary}</p>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              </div>

              {/* News feed */}
              <div>
                <h2 className="font-display text-xl font-semibold text-text-primary mb-4">Policy News</h2>
                <div className="space-y-3">
                  {mockNews.slice(0, 4).map((item, i) => (
                    <GlassCard key={item.id} delay={i * 0.07} className="rounded-2xl p-4">
                      <div className="flex items-start gap-3">
                        <BookOpen className="w-3.5 h-3.5 text-text-muted flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-text-primary mb-1 leading-snug">{item.title}</p>
                          <div className="flex items-center gap-2">
                            <Clock className="w-2.5 h-2.5 text-text-muted" />
                            <span className="text-[10px] text-text-muted">{timeAgo(item.date)} • {item.source}</span>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* AI Advisor CTA */}
              <GlassCard className="rounded-2xl p-5 bg-gradient-to-br from-primary/10 to-secondary/5 border-primary/20">
                <h3 className="font-display font-semibold text-text-primary mb-2">Ask the AI Advisor</h3>
                <p className="text-xs text-text-muted mb-4">Get personalized answers about how any policy affects your specific situation.</p>
                <Link href="/advisor">
                  <button className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2">
                    Start chatting <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </GlassCard>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
