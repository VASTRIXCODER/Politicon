import { Pause, Play } from 'lucide-react';
import { impactSign } from '@/lib/format';
import { CATEGORIES, EXAMPLE_POLICIES, formatAnnual, largestEffect } from '@/lib/explorerData';

const TONE = { gain: 'text-positive', loss: 'text-negative', neutral: 'text-text-muted' } as const;
const categoryLabel = (key: string) => CATEGORIES.find(c => c.key === key)?.label ?? key;

// The same illustrative examples as the explorer chart, each with the bracket it affects most.
const tags = EXAMPLE_POLICIES.map(policy => {
  const { bracket, amount } = largestEffect(policy);
  return { id: policy.id, label: policy.title, category: categoryLabel(policy.category), amount, bracket: bracket.label };
});

function TagList({ hidden = false }: { hidden?: boolean }) {
  return (
    // pr-4 (not a gap between the two lists) keeps the -50% loop seamless.
    <ul
      className="flex gap-4 pr-4 flex-shrink-0"
      aria-label={hidden ? undefined : 'Illustrative example policies (not real analyses)'}
      aria-hidden={hidden || undefined}
    >
      {tags.map(tag => (
        // Solid tint, no backdrop-filter: 20 moving chips would re-blur every frame.
        <li
          key={tag.id}
          className="flex items-center gap-2.5 rounded-full border border-white/8 bg-white/4 px-4 py-2 flex-shrink-0 cursor-default"
        >
          <span className="text-xs text-text-muted font-mono-data">{tag.category}</span>
          <span className="w-px h-3 bg-white/10" aria-hidden="true" />
          <span className="text-xs text-text-primary font-medium">{tag.label}</span>
          <span className={`text-xs font-mono-data font-semibold ${TONE[impactSign(tag.amount)]}`}>
            {formatAnnual(tag.amount)}
          </span>
          <span className="text-xs text-text-muted">{tag.bracket} households</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Scrolling ticker of the illustrative example policies (lib/explorerData),
 * labelled as examples. The list is rendered twice for the loop; the copy is
 * hidden from screen readers. Pausing is pure CSS (a checkbox), so it works
 * before and without hydration.
 */
export default function MarqueeStrip() {
  return (
    <div className="group/marquee relative py-4 border-y border-white/6 overflow-hidden bg-surface/30">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-base to-transparent z-10" aria-hidden="true" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-base to-transparent z-10" aria-hidden="true" />

      {/* Always visible, so no chip reads as a real estimate. */}
      <p
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full border border-gold/20 bg-base/90 px-3 py-1.5 text-meta font-mono-data uppercase tracking-wide text-gold"
        aria-hidden="true"
      >
        Illustrative
      </p>

      <div
        className="flex w-max animate-marquee hover:[animation-play-state:paused] group-has-[:checked]/marquee:[animation-play-state:paused]"
      >
        <TagList />
        <TagList hidden />
      </div>

      {/* WCAG 2.2.2: moving content needs a pause control. */}
      <label
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-base/90 text-text-muted transition-colors hover:text-text-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-300 motion-reduce:hidden"
      >
        <input type="checkbox" className="peer sr-only" aria-label="Pause scrolling ticker" />
        <Pause className="w-3.5 h-3.5 peer-checked:hidden" aria-hidden="true" />
        <Play className="w-3.5 h-3.5 hidden peer-checked:block" aria-hidden="true" />
      </label>
    </div>
  );
}
