import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Logo from '@/components/ui/Logo';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import CivicSeal from './CivicSeal';
import { PANE_TITLE } from './fields';
import styles from './auth.module.css';

/**
 * Centered card layout shared by the smaller account pages (forgot, reset,
 * confirm): a porcelain pane on the paper, like a letter from the record.
 * The civic seal is pressed into its corner, a rim of violet light draws in
 * along its top edge, a mono eyebrow names the step, and a perforated line
 * sets the heading apart from the form below it.
 */
export default function AuthCard({
  title,
  subtitle,
  eyebrow = 'Your account',
  children,
}: {
  title: string;
  subtitle?: string;
  /** A short kicker above the title ("Account recovery"). */
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:p-8">
      <AmbientBackground />
      <main id="main" tabIndex={-1} className="relative z-content w-full max-w-md">
        <Link href="/auth/signin" className="group mb-6 inline-flex items-center gap-2 rounded-lg text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-civic group-hover:-translate-x-1" aria-hidden="true" />
          <span className="text-sm">Back to sign in</span>
        </Link>
        <Surface pad="none" className="overflow-hidden">
          <span
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent', styles.rim)}
          />
          {/* Corner seal, kept clear of the heading below it. */}
          <CivicSeal className="absolute -right-14 -top-14 h-36 w-36 sm:-right-10 sm:-top-10" />
          <div className="relative px-6 pb-7 pt-6 sm:px-10 sm:pt-9">
            <Logo size="lg" href={null} className="mb-8 flex w-fit" />
            <p className="mb-3 inline-flex items-center gap-2.5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-primary-300">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_0_3px_rgb(var(--c-violet)/0.18),0_0_12px_rgb(var(--c-glow)/0.9)]"
              />
              {eyebrow}
            </p>
            <h1 className={cn(PANE_TITLE, 'mb-2')}>{title}</h1>
            {subtitle && <p className="text-sm leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {/* A perforated tear between the heading and the form. */}
          <div aria-hidden="true" className="mx-6 h-px bg-[linear-gradient(to_right,rgb(var(--c-fg)/0.2)_55%,transparent_0)] bg-[length:7px_1px] sm:mx-10" />
          <div className="relative px-6 pb-8 pt-7 sm:px-10 sm:pb-10">{children}</div>
        </Surface>
        <p className="mt-6 text-center text-xs text-muted">
          Stuck? The <Link href="/help" className="rounded text-primary-300 underline underline-offset-2 hover:text-ink">help page</Link> covers missing and expired emails.
        </p>
      </main>
    </div>
  );
}
