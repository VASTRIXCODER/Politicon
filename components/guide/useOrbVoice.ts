'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersLessMotion } from '@/lib/motion';
import { speechBeats } from '@/components/guide/orbVoice';

/**
 * The orb's voice: whether it is speaking a reply that just arrived, and its
 * pulse count (one more per word, components/guide/orbVoice.ts).
 *
 *   const voice = useOrbVoice();
 *   voice.speak(reply.content);                       // when a reply lands
 *   const state = orbState(isTyping, voice.speaking); // thinking wins
 *   <GuideOrbView state={state} pulse={voice.pulse} />
 *
 * Under reduced motion (or "Pause motion") the orb never speaks: it stays on
 * its still frame and the pulse count stays put. Speaking a new reply
 * replaces any still in progress.
 */
export function useOrbVoice(): { speaking: boolean; pulse: number; speak: (text: string) => void } {
  const [speaking, setSpeaking] = useState(false);
  const [pulse, setPulse] = useState(0);
  const timers = useRef<{ beat?: number; end?: number }>({});

  const stop = useCallback(() => {
    window.clearInterval(timers.current.beat);
    window.clearTimeout(timers.current.end);
    timers.current = {};
  }, []);

  const speak = useCallback(
    (text: string) => {
      stop();
      if (prefersLessMotion()) {
        setSpeaking(false);
        return;
      }
      const { beats, intervalMs, durationMs } = speechBeats(text);
      setSpeaking(true);
      let left = beats;
      const beat = () => {
        if (left <= 0) {
          window.clearInterval(timers.current.beat);
          return;
        }
        left -= 1;
        setPulse((p) => p + 1);
      };
      beat();
      if (left > 0) timers.current.beat = window.setInterval(beat, intervalMs);
      timers.current.end = window.setTimeout(() => {
        stop();
        setSpeaking(false);
      }, durationMs);
    },
    [stop]
  );

  useEffect(() => stop, [stop]);

  return { speaking, pulse, speak };
}
