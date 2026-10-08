import { Zap } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';

/**
 * Full-screen splash while the session or profile loads. Announced once as a
 * polite status, so screen-reader users hear more than silence.
 */
export default function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main id="main" tabIndex={-1} className="min-h-screen relative flex items-center justify-center">
      <AmbientBackground />
      <div role="status" className="relative z-10 flex flex-col items-center gap-4">
        <div aria-hidden="true" className="w-10 h-10 rounded-2xl bg-primary/20 border border-primary/20 flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div aria-hidden="true" className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
        <span className="sr-only">{label}</span>
      </div>
    </main>
  );
}
