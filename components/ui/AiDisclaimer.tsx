import Link from 'next/link';
import { Info } from 'lucide-react';

/** Shown next to every AI-generated output. */
export default function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-meta leading-relaxed text-text-muted ${className}`}>
      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" aria-hidden />
      <span>
        AI-generated estimate for education — not financial, tax or legal advice. Check the official record and
        consider a qualified professional before making decisions.{' '}
        <Link href="/disclaimer" className="underline underline-offset-2 hover:text-text-primary">Learn more</Link>
      </span>
    </p>
  );
}

/** A plain-language label for a 0–100 confidence score. */
export function confidenceLabel(score: number): { label: string; tone: string } {
  if (!score) return { label: 'Confidence not rated', tone: 'text-text-muted' };
  if (score >= 75) return { label: 'Higher confidence', tone: 'text-emerald-400' };
  if (score >= 45) return { label: 'Moderate confidence', tone: 'text-gold' };
  return { label: 'Low confidence', tone: 'text-amber-300' };
}
