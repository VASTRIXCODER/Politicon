import Link from 'next/link';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Shown next to every AI-generated output. */
export default function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-meta leading-relaxed text-text-muted', className)}>
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px text-primary-300" aria-hidden />
      <span>
        AI-generated estimate for education — not financial, tax or legal advice. Check the official record and
        consider a qualified professional before making decisions.{' '}
        <Link
          href="/disclaimer"
          className="font-medium text-text-primary underline decoration-fg/30 underline-offset-2 transition-colors duration-200 ease-civic hover:decoration-primary"
        >
          Learn more
        </Link>
      </span>
    </p>
  );
}

/**
 * A plain-language label for a 0–100 confidence score. The words carry the
 * meaning; the tone only echoes it (gold is kept for official-record accents).
 */
export function confidenceLabel(score: number): { label: string; tone: string } {
  if (!score) return { label: 'Confidence not rated', tone: 'text-text-muted' };
  if (score >= 75) return { label: 'Higher confidence', tone: 'text-gain' };
  if (score >= 45) return { label: 'Moderate confidence', tone: 'text-primary-300' };
  return { label: 'Low confidence', tone: 'text-caution' };
}
