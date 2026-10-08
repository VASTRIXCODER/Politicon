import { Pause, Play } from 'lucide-react';
import { hotPolicyTags } from '@/mocks/policies';

function TagList({ hidden = false }: { hidden?: boolean }) {
  return (
    // pr-4 (not a gap between the two lists) keeps the -50% loop seamless.
    <ul
      className="flex gap-4 pr-4 flex-shrink-0"
      aria-label={hidden ? undefined : 'Example policy impacts'}
      aria-hidden={hidden || undefined}
    >
      {hotPolicyTags.map(tag => (
        // Solid tint, no backdrop-filter: 20 moving chips would re-blur every frame.
        <li
          key={tag.label}
          className="flex items-center gap-2.5 rounded-full border border-white/8 bg-white/4 px-4 py-2 flex-shrink-0 cursor-default"
        >
          <span className="text-xs text-text-muted font-mono-data">{tag.category}</span>
          <span className="w-px h-3 bg-white/10" aria-hidden="true" />
          <span className="text-xs text-text-primary font-medium">{tag.label}</span>
          <span className={`text-xs font-mono-data font-semibold ${
            tag.direction === 'positive' ? 'text-positive' : 'text-negative'
          }`}>
            {tag.impact}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Scrolling ticker of example policies. The list is rendered twice for the
 * loop; the copy is hidden from screen readers. Pausing is pure CSS (a
 * checkbox), so it works before and without hydration.
 */
export default function MarqueeStrip() {
  return (
    <div className="group/marquee relative py-4 border-y border-white/6 overflow-hidden bg-surface/30">
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-base to-transparent z-10" aria-hidden="true" />
      <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-base to-transparent z-10" aria-hidden="true" />

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
