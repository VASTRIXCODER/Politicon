import type { OrbState } from '@/components/guide/orbVoice';
import { cn } from '@/lib/utils';
import styles from './guide.module.css';

/**
 * The Policy Guide's orb in CSS: the server-rendered stand-in for the 3D
 * orb (components/three/scenes/GuideOrb), and all there is on devices
 * without 3D. A sphere of violet light with a lilac rim, breathing slowly;
 * a band of light turns around it while the guide is thinking, and each
 * pulse sends a ring of light out from it. Decoration: no hooks, so it
 * renders from a server component too.
 */
export default function OrbPoster({ state = 'idle', pulse = 0, className }: { state?: OrbState; pulse?: number; className?: string }) {
  return (
    <div aria-hidden="true" data-decorative="" data-state={state} className={cn(styles.poster, className)}>
      <span className={styles.halo} />
      <span className={styles.orb} />
      {state === 'speaking' && pulse > 0 && <span key={pulse} className={styles.ripple} />}
    </div>
  );
}

/** The small, still orb beside each of the guide's replies. */
export function MiniOrb({ className }: { className?: string }) {
  return <span aria-hidden="true" data-decorative="" className={cn(styles.mini, className)} />;
}
