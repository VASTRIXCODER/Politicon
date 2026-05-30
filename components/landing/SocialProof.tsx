'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const pressLogos = [
  { name: 'TechCrunch', abbr: 'TC' },
  { name: 'Bloomberg', abbr: 'BB' },
  { name: 'Axios', abbr: 'AX' },
  { name: 'The Atlantic', abbr: 'TA' },
  { name: 'NPR', abbr: 'NPR' },
  { name: 'Politico', abbr: 'PO' },
];

const testimonials = [
  {
    quote: 'Finally, a tool that tells me the dollar amount instead of the political talking point. I saved $2,400 last year because of what Politicon found.',
    name: 'Sarah K.',
    title: 'Software engineer, California',
    stars: 5,
  },
  {
    quote: 'I had no idea the healthcare subsidy extension applied to me. Politicon flagged it immediately based on my income. That\'s $180/month back in my pocket.',
    name: 'Marcus T.',
    title: 'Freelance designer, Texas',
    stars: 5,
  },
  {
    quote: 'The AI advisor is incredible. I asked about the homebuyer credit and it gave me a specific breakdown for my income and county. Personalized advice I would have paid a financial advisor for.',
    name: 'Priya M.',
    title: 'First-time homebuyer, New York',
    stars: 5,
  },
];

export default function SocialProof() {
  return (
    <section className="py-24 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Press logos */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-xs font-mono-data text-text-muted uppercase tracking-widest mb-8">As seen in</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {pressLogos.map((logo, i) => (
              <motion.div
                key={logo.name}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="glass rounded-xl px-5 py-3 text-text-muted hover:text-text-primary transition-colors"
              >
                <span className="font-display font-semibold text-sm tracking-tight">{logo.name}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Testimonials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="glass rounded-3xl p-6 flex flex-col"
            >
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: t.stars }).map((_, j) => (
                  <Star key={j} className="w-3.5 h-3.5 text-gold fill-gold" />
                ))}
              </div>
              <blockquote className="text-sm text-text-muted leading-relaxed flex-1 mb-6">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div className="flex items-center gap-3 pt-4 border-t border-white/6">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">{t.name[0]}</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{t.name}</p>
                  <p className="text-xs text-text-muted">{t.title}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
