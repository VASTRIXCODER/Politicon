import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Logo from '@/components/ui/Logo';
import MotionToggle from '@/components/ui/MotionToggle';
import Surface from '@/components/ui/Surface';
import { cn } from '@/lib/utils';
import CivicSeal from './CivicSeal';
import styles from './auth.module.css';

/*
 * The sign-in and sign-up layout. On a wide screen it is a split: the form
 * on a porcelain pane over the paper on the left, the night panel (the glass
 * seal and a short statement, `panel`) on the right, held in view while the
 * form scrolls. Below lg the panel gives way to a compact night band with the
 * logo, and the form comes straight after it.
 *
 *   <AuthSplit panel={<AuthPanel kind="signin" />}>
 *     <AuthPane><SignInForm /></AuthPane>
 *   </AuthSplit>
 */
export default function AuthSplit({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)]">
      <AmbientBackground />

      {/* Phones and tablets: the brand on a small night plate. */}
      <header
        data-night=""
        className={cn('relative z-content mx-4 mt-3 overflow-hidden rounded-pane bg-canvas text-ink sm:mx-auto sm:mt-6 sm:max-w-[27rem] lg:hidden', styles.panelRim)}
      >
        <div aria-hidden="true" data-decorative="" className={cn('pointer-events-none absolute inset-0', styles.aurora)} />
        <div className="relative flex items-center justify-between gap-4 py-3 pl-4 pr-3">
          <Logo size="md" href={null} />
          <CivicSeal tone="lit" ringClassName={styles.turning} className="h-11 w-11 flex-shrink-0 opacity-80" />
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="relative z-content flex justify-center px-4 pb-16 pt-6 sm:px-8 sm:pt-8 lg:min-h-screen lg:items-center lg:py-14"
      >
        <div className="w-full max-w-[27rem]">{children}</div>
      </main>

      <aside aria-label="About Politicon" className="relative z-content hidden lg:block">
        <div className="sticky top-0 h-screen p-3 xl:p-4">{panel}</div>
      </aside>
    </div>
  );
}

/**
 * The porcelain pane the form sits on, under a link back home (and the
 * "Pause motion" control, since these pages have no navbar): a rim of
 * violet light drawing in along its top edge and the civic seal pressed into
 * its corner. The logo shows here on wide screens (the night band carries it
 * on phones).
 */
export function AuthPane({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link href="/" className="group inline-flex items-center gap-2 rounded-lg text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4 transition-transform duration-200 ease-civic group-hover:-translate-x-1" aria-hidden="true" />
          Back to home
        </Link>
        {/* The seal turns and the light sweeps: this stops them (and every other motion on the site). */}
        <MotionToggle className="-mr-2" />
      </div>
      <Surface pad="lg" className="overflow-hidden sm:p-9">
        <span
          aria-hidden="true"
          className={cn('pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent', styles.rim)}
        />
        <CivicSeal className="absolute -right-14 -top-14 h-36 w-36 sm:-right-11 sm:-top-11" />
        <Logo size="lg" href={null} className="relative mb-8 hidden w-fit lg:flex" />
        <div className="relative">{children}</div>
      </Surface>
    </>
  );
}
