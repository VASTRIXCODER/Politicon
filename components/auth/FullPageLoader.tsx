import AmbientBackground from '@/components/landing/AmbientBackground';
import LoaderMark from './LoaderMark';

/** Full-screen splash while the session or profile loads: the loading mark alone on the paper. */
export default function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center">
      <AmbientBackground />
      <LoaderMark label={label} className="relative z-content" />
    </main>
  );
}
