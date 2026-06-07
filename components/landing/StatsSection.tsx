'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import AnimatedCounter from '@/components/ui/AnimatedCounter';

const STATIC_STATS = [
  { value: 2400, suffix: '+', label: 'Policies analyzed', sublabel: 'Federal, state & local', prefix: '' },
  { value: 4200, suffix: '/year', label: 'Avg impact found', sublabel: 'Per user across all tracked policies', prefix: '$' },
  { value: 50, suffix: ' states', label: 'States covered', sublabel: 'All 50 US states + DC', prefix: '' },
];

export default function StatsSection() {
  const [userCount, setUserCount] = useState<number>(0);

  useEffect(() => {
    fetch('/api/user-count')
      .then(r => r.json())
      .then(d => setUserCount(d.count ?? 0))
      .catch(() => {});
  }, []);

  const stats = [
    ...STATIC_STATS,
    {
      value: userCount,
      suffix: '+',
      label: 'Members joined',
      sublabel: 'Real accounts, live count',
      prefix: '',
    },
  ];

  return (
    <section className="py-24 relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5" />
      <div className="absolute inset-x-0 h-px top-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="absolute inset-x-0 h-px bottom-0 bg-gradient-to-r from-transparent via-secondary/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="text-center"
            >
              <div className="font-mono-data text-4xl lg:text-5xl font-bold gradient-text-gold mb-2">
                <AnimatedCounter
                  end={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  duration={2200}
                />
              </div>
              <p className="font-display text-sm font-semibold text-text-primary mb-1">{stat.label}</p>
              <p className="text-xs text-text-muted">{stat.sublabel}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
