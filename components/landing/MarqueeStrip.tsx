'use client';

import { hotPolicyTags } from '@/mocks/policies';

export default function MarqueeStrip() {
  const doubled = [...hotPolicyTags, ...hotPolicyTags];

  return (
    <div className="relative py-4 border-y border-white/6 overflow-hidden bg-surface/30">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-base to-transparent z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-base to-transparent z-10" />

      <div
        className="flex gap-4 animate-marquee hover:[animation-play-state:paused]"
        style={{ width: 'max-content' }}
      >
        {doubled.map((tag, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 glass rounded-full px-4 py-2 flex-shrink-0 cursor-default"
          >
            <span className="text-xs text-text-muted font-mono-data">{tag.category}</span>
            <span className="w-px h-3 bg-white/10" />
            <span className="text-xs text-text-primary font-medium">{tag.label}</span>
            <span className={`text-xs font-mono-data font-semibold ${
              tag.direction === 'positive' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {tag.impact}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
