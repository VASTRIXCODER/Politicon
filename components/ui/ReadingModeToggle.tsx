'use client';

import { Sparkles, GraduationCap } from 'lucide-react';
import { useReadingMode } from '@/components/providers/ReadingModeProvider';

/** Persistent Simple / Expert reading-level switch. */
export default function ReadingModeToggle({ className = '' }: { className?: string }) {
  const { mode, setMode } = useReadingMode();

  return (
    <div className={`inline-flex items-center glass rounded-full p-1 text-xs ${className}`}>
      <button
        onClick={() => setMode('simple')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
          mode === 'simple' ? 'bg-secondary/20 text-secondary border border-secondary/30' : 'text-text-muted hover:text-text-primary'
        }`}
        aria-pressed={mode === 'simple'}
      >
        <Sparkles className="w-3 h-3" /> Simple
      </button>
      <button
        onClick={() => setMode('expert')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
          mode === 'expert' ? 'bg-primary/20 text-primary border border-primary/30' : 'text-text-muted hover:text-text-primary'
        }`}
        aria-pressed={mode === 'expert'}
      >
        <GraduationCap className="w-3 h-3" /> Expert
      </button>
    </div>
  );
}
