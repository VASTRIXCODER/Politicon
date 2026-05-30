'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Search, DollarSign, CheckCircle } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: User,
    title: 'Build your profile',
    subtitle: 'Takes 30 seconds',
    description: 'Tell us your income bracket, location, housing situation, debts, and life stage. Your data stays private and powers every analysis.',
    color: '#7B61FF',
    details: ['Income & employment', 'Location & state taxes', 'Housing & debt situation', 'Family & dependents'],
  },
  {
    number: '02',
    icon: Search,
    title: 'Discover policies that affect you',
    subtitle: 'AI-curated for your profile',
    description: 'Our AI scans 2,400+ federal and state policies to surface the ones with the highest dollar impact on your specific situation.',
    color: '#00D4FF',
    details: ['Federal & state coverage', 'Relevance scoring', 'Real-time updates', 'Category filters'],
  },
  {
    number: '03',
    icon: DollarSign,
    title: 'See your exact dollar impact',
    subtitle: 'Immediate, ripple, projected',
    description: "Get a full breakdown: immediate effects, ripple effects, 1/3/5-year projections, and actionable recommendations — all in dollars, not jargon.",
    color: '#F5C842',
    details: ['Immediate monthly impact', '5-year projections', 'Trade-off analysis', 'Action steps'],
  },
];

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.getAttribute('data-step') || '0');
            setActiveStep(idx);
          }
        });
      },
      { threshold: 0.5, rootMargin: '-20% 0px -20% 0px' }
    );

    const stepEls = el.querySelectorAll('[data-step]');
    stepEls.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="how-it-works" className="py-32 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <p className="text-xs font-mono-data text-primary uppercase tracking-widest mb-4">The Process</p>
          <h2 className="font-display text-4xl sm:text-5xl font-bold text-text-primary mb-4">
            From policy to your wallet
            <br />
            <span className="gradient-text">in three steps</span>
          </h2>
          <p className="text-text-muted text-lg max-w-xl mx-auto">
            Built for people who care about their finances, not their news feed.
          </p>
        </motion.div>

        {/* Steps */}
        <div ref={containerRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isActive = activeStep === i;
            return (
              <motion.div
                key={step.number}
                data-step={i}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.12 }}
                onClick={() => setActiveStep(i)}
                className={`glass rounded-3xl p-8 cursor-pointer transition-all duration-300 ${
                  isActive ? 'border-white/16 shadow-lg' : ''
                }`}
                style={isActive ? { boxShadow: `0 20px 60px ${step.color}22` } : {}}
              >
                {/* Step number */}
                <div className="flex items-center justify-between mb-6">
                  <span
                    className="font-mono-data text-5xl font-bold opacity-20"
                    style={{ color: step.color }}
                  >
                    {step.number}
                  </span>
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ backgroundColor: step.color + '18', border: `1px solid ${step.color}30` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: step.color }} />
                  </div>
                </div>

                {/* Content */}
                <p className="text-xs font-mono-data mb-2" style={{ color: step.color }}>
                  {step.subtitle}
                </p>
                <h3 className="font-display text-xl font-semibold text-text-primary mb-3">
                  {step.title}
                </h3>
                <p className="text-text-muted text-sm leading-relaxed mb-6">
                  {step.description}
                </p>

                {/* Detail list */}
                <ul className="space-y-2">
                  {step.details.map(detail => (
                    <li key={detail} className="flex items-center gap-2.5">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: step.color }} />
                      <span className="text-xs text-text-muted">{detail}</span>
                    </li>
                  ))}
                </ul>

                {/* Progress bar */}
                {isActive && (
                  <motion.div
                    className="h-0.5 rounded-full mt-6"
                    style={{ backgroundColor: step.color }}
                    initial={{ scaleX: 0, transformOrigin: 'left' }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 3, ease: 'linear' }}
                    onAnimationComplete={() => {
                      if (i < steps.length - 1) setActiveStep(i + 1);
                      else setActiveStep(0);
                    }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
