import Link from 'next/link';
import { useId } from 'react';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Logo from '@/components/ui/Logo';
import Surface from '@/components/ui/Surface';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

const SEAL_TEXT = 'NON-PARTISAN · EDUCATIONAL ESTIMATES · REAL BILLS · ';
// The seal's text runs on a circle of this radius; textLength fits it exactly once around.
const TEXT_RADIUS = 67;

/** One pass of the seal's line work (rings, ticks, text and the mark), in currentColor. */
function SealArt({ textPathId }: { textPathId: string }) {
  return (
    <>
      <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" strokeWidth="1.4" />
      {/* 72 ticks, one every 5 degrees. */}
      <circle cx="100" cy="100" r="87" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="1.1 6.49" />
      <circle cx="100" cy="100" r="79" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <text fill="currentColor" fontSize="9.5" fontWeight="600" letterSpacing="1.5" className="font-mono-data">
        <textPath href={`#${textPathId}`} textLength={Math.round(2 * Math.PI * TEXT_RADIUS) - 4} lengthAdjust="spacing">
          {SEAL_TEXT}
        </textPath>
      </text>
      <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeWidth="1" />
      <svg x="62" y="62" width="76" height="76" viewBox={MARK_VIEWBOX}>
        <path d={MARK_PATHS.dome + MARK_PATHS.base} fill="currentColor" />
      </svg>
    </>
  );
}

/**
 * A round civic seal (the Aperture Dome inside rings of ticks and lettering),
 * pressed into the paper: violet line work with a lip of light below it by
 * day, a faint violet glow by night. Decorative.
 */
export function AuthSeal({ className }: { className?: string }) {
  const id = useId();
  const textPathId = `${id}seal-text`;
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      data-decorative
      focusable="false"
      className={cn('pointer-events-none select-none', className)}
    >
      <defs>
        <path
          id={textPathId}
          d={`M ${100 - TEXT_RADIUS} 100 a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 ${TEXT_RADIUS * 2} 0 a ${TEXT_RADIUS} ${TEXT_RADIUS} 0 1 1 ${-TEXT_RADIUS * 2} 0`}
        />
      </defs>
      {/* The emboss: the same line work in white, a pixel lower (day only). */}
      <g transform="translate(0 1.2)" className="text-white opacity-80 dark:hidden">
        <SealArt textPathId={textPathId} />
      </g>
      <g className="text-primary opacity-[0.16] dark:opacity-[0.22]">
        <SealArt textPathId={textPathId} />
      </g>
    </svg>
  );
}

/** Centered card layout shared by the smaller auth pages (forgot, reset, confirm): a porcelain pane on the paper. */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:p-8">
      <AmbientBackground />
      <main id="main" tabIndex={-1} className="relative z-content w-full max-w-md">
        <Link href="/auth/signin" className="group mb-6 inline-flex items-center gap-2 rounded-lg text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-civic group-hover:-translate-x-1" aria-hidden="true" />
          <span className="text-sm">Back to sign in</span>
        </Link>
        <Surface
          pad="lg"
          className={cn(
            'overflow-hidden sm:p-10',
            // A rim of violet light along the pane's top edge.
            'before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/40 before:to-transparent'
          )}
        >
          {/* Corner seal, kept clear of the heading below it. */}
          <AuthSeal className="absolute -right-14 -top-14 h-36 w-36 sm:-right-10 sm:-top-10" />
          <Logo size="lg" href={null} className="relative mb-8 flex w-fit" />
          <h1 className={cn('relative font-display text-[2rem] font-semibold leading-[1.1] tracking-[-0.02em] text-ink', subtitle ? 'mb-2' : 'mb-8')}>
            {title}
          </h1>
          {subtitle && <p className="relative mb-8 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="relative">{children}</div>
        </Surface>
      </main>
    </div>
  );
}
