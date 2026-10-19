import OrbPoster from '@/components/guide/OrbPoster';
import { cn } from '@/lib/utils';
import { DOCK_ROW, GuideStatus, GuideTitle, ORB_DOCK_SIZE } from './ChamberTitle';

/**
 * The Chamber before the conversation has loaded: the prerendered HTML, so
 * the page already shows its orb (the CSS poster) and its title in the
 * night, and tells screen readers it is loading. No hooks: a server
 * component.
 */
export default function ChamberFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true">
      <div aria-hidden="true" className="h-[4.75rem] flex-shrink-0 sm:h-20" />
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6">
        <div className={cn('flex items-center gap-2.5 sm:gap-3', DOCK_ROW)}>
          <span aria-hidden="true" className="h-9 w-9 flex-shrink-0" />
          <div className={cn('relative flex-shrink-0', ORB_DOCK_SIZE)}>
            <OrbPoster />
          </div>
          <div className="min-w-0 flex-1">
            <GuideTitle />
            <GuideStatus />
          </div>
        </div>
        <span className="sr-only">Loading the Policy Guide…</span>
      </div>
    </div>
  );
}
