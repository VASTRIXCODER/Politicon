import OrbPoster from '@/components/guide/OrbPoster';
import { GuideStatus, GuideTitle } from './ChamberTitle';

/**
 * The Chamber before the conversation has loaded: the prerendered HTML, so
 * the page already shows its orb (the CSS poster) and its title in the
 * night, and tells screen readers it is loading. No hooks: a server
 * component.
 */
export default function ChamberFallback() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true">
      <div aria-hidden="true" className="h-[4.75rem] flex-shrink-0 sm:h-20" />
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6">
        <div className="flex items-center gap-3 py-3 sm:gap-4">
          <span aria-hidden="true" className="h-9 w-9 flex-shrink-0" />
          <div className="relative size-14 flex-shrink-0 sm:size-16 lg:size-24">
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
