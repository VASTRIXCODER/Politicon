'use client';

export default function AmbientBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Base mesh gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(123,97,255,0.12) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 100% 50%, rgba(0,212,255,0.06) 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 0% 80%, rgba(123,97,255,0.08) 0%, transparent 60%)',
        }}
      />

      {/* Violet orb 1 */}
      <div
        className="absolute rounded-full animate-orb-1"
        style={{
          width: '600px',
          height: '600px',
          top: '-100px',
          left: '10%',
          background: 'radial-gradient(circle, rgba(123,97,255,0.15) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />

      {/* Cyan orb 2 */}
      <div
        className="absolute rounded-full animate-orb-2"
        style={{
          width: '500px',
          height: '500px',
          top: '30%',
          right: '-100px',
          background: 'radial-gradient(circle, rgba(0,212,255,0.10) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      {/* Violet orb 3 - bottom */}
      <div
        className="absolute rounded-full animate-orb-3"
        style={{
          width: '400px',
          height: '400px',
          bottom: '10%',
          left: '30%',
          background: 'radial-gradient(circle, rgba(123,97,255,0.10) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
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
