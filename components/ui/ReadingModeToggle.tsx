'use client';

import { Sparkles, GraduationCap } from 'lucide-react';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';

/** Persistent Simple / Expert reading-level switch. */
export default function ReadingModeToggle({ className = '' }: { className?: string }) {
  const { mode, setMode } = useReadingMode();

  return (
    <div role="group" aria-label="Reading level" className={`inline-flex items-center glass rounded-full p-1 text-xs ${className}`}>
      <button
        type="button"
        onClick={() => setMode('simple')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
          mode === 'simple' ? 'bg-secondary/20 text-secondary border-secondary/30' : 'border-transparent text-text-muted hover:text-text-primary'
        }`}
        aria-pressed={mode === 'simple'}
      >
        <Sparkles className="w-3 h-3" aria-hidden /> Simple
      </button>
      <button
        type="button"
        onClick={() => setMode('expert')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
          mode === 'expert' ? 'bg-primary/20 text-primary-300 border-primary/30' : 'border-transparent text-text-muted hover:text-text-primary'
        }`}
        aria-pressed={mode === 'expert'}
      >
        <GraduationCap className="w-3 h-3" aria-hidden /> Expert
      </button>
    </div>
  );
}
