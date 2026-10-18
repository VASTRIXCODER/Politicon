import type { Ref } from 'react';
import Badge from '@/components/ui/Badge';
import { RECORD_PX, SHEET } from '@/components/three/scenes/filmShots';
import { BILL_RECORD } from './shots';

/** The record's box: the sheet's face, RECORD_PX to a unit. */
export const RECORD_SIZE = { width: SHEET.width * RECORD_PX, height: SHEET.height * RECORD_PX } as const;

/*
 * The bill's official record as real type, laid out on the face of the
 * film's glass sheet: chamber and number, the title, the status chip and the
 * date, with the body as faint lines above the sheet's gold seal (which the
 * 3D sheet carries). The scene places it every frame while the sheet rests in
 * shot 2 (LandingFilm's `record`), mapping this box onto the sheet's
 * projected corners, and fades it in and out with the shot; until then it
 * stays hidden.
 *
 * Decorative (aria-hidden): the caption says what the shot means, and the
 * record is an example, labelled as one.
 */
export default function BillRecord({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-decorative=""
      className="pointer-events-none absolute left-0 top-0 origin-top-left select-none text-ink [backface-visibility:hidden]"
      style={{ width: RECORD_SIZE.width, height: RECORD_SIZE.height, opacity: 0, visibility: 'hidden' }}
    >
      <div className="flex h-full flex-col px-7 pb-24 pt-7">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono-data text-[10px] uppercase tracking-[0.2em] text-ink/70">
            {/* Archive gold marks the official record. */}
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            {BILL_RECORD.kicker}
          </span>
          <Badge variant="example" className="border-ink/40 text-ink/75">
            Example
          </Badge>
        </div>
        <p className="mt-5 font-mono-data text-[12px] tracking-wide text-ink/75">
          {BILL_RECORD.number} · {BILL_RECORD.chamber}
        </p>
        <p className="mt-1.5 font-display text-[23px] font-medium leading-[1.12] tracking-[-0.01em] text-ink">{BILL_RECORD.title}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono-data text-[10.5px] text-primary-300">
            <span className="h-1 w-1 rounded-full bg-primary" />
            {BILL_RECORD.status}
          </span>
          <span className="font-mono-data text-[10.5px] text-ink/70">{BILL_RECORD.introduced}</span>
        </div>
        <span className="mt-5 h-px w-full bg-ink/15" />
        {/* The body: lines of text, too fine to read at this size. */}
        <div className="mt-4 space-y-[9px]">
          {[1, 0.94, 1, 0.62, 0.97, 0.88, 0.5].map((w, i) => (
            <span key={i} className="block h-[4px] rounded-full bg-ink/[0.16]" style={{ width: `${w * 100}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
