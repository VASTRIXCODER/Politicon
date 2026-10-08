import { cn } from '@/lib/utils';

interface AmbientBackgroundProps {
  /**
   * Let the orbs drift (marketing pages). App pages keep them still: they sit
   * behind glass panels that would otherwise re-blur every frame. Drift is
   * also off on touch devices and under reduced motion.
   */
  animated?: boolean;
}

// The orbs fade out through several stops, so they read as soft blurs without
// a CSS filter (a 60-80px blur over a 600px layer is costly on phones).
const violet = (a: number) =>
  `radial-gradient(circle closest-side, rgba(123,97,255,${a}) 0%, rgba(123,97,255,${a * 0.6}) 35%, rgba(123,97,255,${a * 0.22}) 65%, transparent 100%)`;
const cyan = (a: number) =>
  `radial-gradient(circle closest-side, rgba(0,212,255,${a}) 0%, rgba(0,212,255,${a * 0.6}) 35%, rgba(0,212,255,${a * 0.22}) 65%, transparent 100%)`;

export default function AmbientBackground({ animated = false }: AmbientBackgroundProps) {
  const drift = (animation: string) =>
    cn('absolute rounded-full', animated && [animation, '[@media(pointer:coarse)]:animate-none motion-reduce:animate-none']);

  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base mesh gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(123,97,255,0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 100% 50%, rgba(0,212,255,0.06) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 0% 80%, rgba(123,97,255,0.08) 0%, transparent 60%)',
        }}
      />

      {/* Violet orb 1 */}
      <div
        className={drift('animate-orb-1')}
        style={{ width: '720px', height: '720px', top: '-160px', left: 'calc(10% - 60px)', background: violet(0.15) }}
      />

      {/* Cyan orb 2 */}
      <div
        className={drift('animate-orb-2')}
        style={{ width: '660px', height: '660px', top: 'calc(30% - 80px)', right: '-180px', background: cyan(0.1) }}
      />

      {/* Violet orb 3 - bottom */}
      <div
        className={drift('animate-orb-3')}
        style={{ width: '540px', height: '540px', bottom: 'calc(10% - 70px)', left: 'calc(30% - 70px)', background: violet(0.1) }}
      />

      {/* Grid lines subtle overlay */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />
    </div>
  );
}
