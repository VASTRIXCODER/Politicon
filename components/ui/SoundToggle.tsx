'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { playCue, useSoundEnabled } from '@/lib/sound';
import { cn } from '@/lib/utils';

/**
 * Turns the optional interface sounds on and off (off by default). A toggle
 * button: its name stays "Sound effects" and aria-pressed says whether they
 * are on. The server render says off; a saved "on" shows right after hydration.
 */
export default function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useSoundEnabled();

  const toggle = () => {
    const next = !on;
    setOn(next);
    // One soft chime confirms sound is on. setOn starts the audio inside this
    // click, which is what lets the browser play it; the chime itself may
    // follow a moment later, once the synthesizer's chunk is in.
    if (next) playCue('chime');
  };

  const Icon = on ? Volume2 : VolumeX;

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-transparent',
        'transition-colors duration-200 ease-civic hover:border-fg/10 hover:bg-fg/5 hover:text-ink',
        on ? 'text-primary-300' : 'text-muted',
        className
      )}
    >
      <span className="sr-only">Sound effects</span>
      <Icon aria-hidden="true" className="h-[1.125rem] w-[1.125rem]" />
      {/* A point of violet light while sound is on. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary shadow-[0_0_6px_1px_rgb(var(--c-violet)/0.7)]',
          'transition-opacity duration-300 ease-civic',
          on ? 'opacity-100' : 'opacity-0'
        )}
      />
    </button>
  );
}
