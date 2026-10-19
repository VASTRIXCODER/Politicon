import type { ReactNode } from 'react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Navbar from '@/components/layout/Navbar';
import { cn } from '@/lib/utils';

/*
 * The frame of every signed-in page: the ambient light field (its CSS
 * poster; the stage's shader field draws over it where 3D runs), the
 * floating navigation bar and the page's one <main id="main">, the skip
 * link's target. Pages put their own content (and their toast) inside.
 *
 *   <AppShell>…</AppShell>                         a day page (the default)
 *   <AppShell night>…</AppShell>                   the whole page in the Chamber
 *   <AppShell hideNav mainClassName="max-w-3xl">   a focused flow, no bar
 *
 * `night` makes the page a night section in both senses: data-night flips
 * its tokens (so it reads as night in the light theme too) and
 * data-scene-night asks the stage to paint the Chamber's light behind it.
 * Until the stage has drawn (and on devices without 3D) the page shows its
 * own night canvas; app/globals.css makes that transparent once the field
 * is live (data-scene-night-live), so 3D views on the page show through.
 *
 * No hooks: a server component wherever it's rendered from one.
 */

export interface AppShellProps {
  children: ReactNode;
  /** Classes for <main>, merged over the default column (width, gutters, the room under the bar). */
  mainClassName?: string;
  /** The whole page is a night scene (the Chamber), whatever the theme. */
  night?: boolean;
  /** Leave the navigation bar out (a focused flow such as onboarding). */
  hideNav?: boolean;
}

// pt-28 clears the floating bar; without it the page starts nearer the top.
const MAIN = 'mx-auto w-full max-w-7xl px-4 pb-20 pt-28 sm:px-6 lg:px-8';

export default function AppShell({ children, mainClassName, night = false, hideNav = false }: AppShellProps) {
  return (
    <div
      className={cn('relative min-h-screen', night && 'bg-canvas text-ink')}
      {...(night ? { 'data-night': '', 'data-scene-night': '' } : {})}
    >
      <AmbientBackground />
      <div className="relative z-content">
        {!hideNav && <Navbar />}
        <main id="main" tabIndex={-1} className={cn(MAIN, hideNav && 'pt-10 sm:pt-14', mainClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
