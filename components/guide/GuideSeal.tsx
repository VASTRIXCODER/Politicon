import { LogoMark } from '@/components/ui/Logo';
import { cn } from '@/lib/utils';

/**
 * The seal on the guide's fixed replies (guardrail cards): the Aperture Dome
 * pressed into a round violet seal with a ring of light. Violet, never gold
 * (gold marks only the official record) and never the danger red: these
 * replies are calm. Decoration; the card says in words what it is.
 */
export default function GuideSeal({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-decorative=""
      className={cn(
        'relative grid h-12 w-12 flex-shrink-0 place-items-center rounded-full',
        'bg-[radial-gradient(circle_at_35%_30%,rgb(var(--c-violet)/0.38),rgb(var(--c-violet)/0.12)_62%,transparent_100%)]',
        'shadow-[inset_0_0_0_1px_rgb(var(--c-violet-text)/0.45),inset_0_2px_6px_rgb(255_255_255/0.08),inset_0_-3px_8px_rgb(0_0_0/0.35),0_0_24px_-6px_rgb(var(--c-violet)/0.6)]',
        className
      )}
    >
      {/* The seal's milled edge. */}
      <span className="absolute inset-1 rounded-full border border-dashed border-primary-300/40" />
      <LogoMark className="relative h-7 w-7 text-primary-300" />
    </span>
  );
}
