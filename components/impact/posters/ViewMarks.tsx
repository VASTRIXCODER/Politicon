import type { SceneAngle, TransmissionTone, Vec3, ViewBox } from '@/lib/transmission';
import { placer, projector } from '@/components/impact/posters/draw';
import { cn } from '@/lib/utils';

/*
 * Numbers laid over a Transmission view (the scene and its poster alike):
 * one small numbered badge per thing the picture draws (a crystal's axis, a
 * terrain's tile), at the world point the scene's frame puts it, in DOM type
 * that stays readable in any box. The caption beside the view numbers its
 * rows the same way, so a figure in the list can be found in the picture.
 * The box's shape is given (`aspect`, its aspect-* class), so the numbers
 * land without measuring and render on the server, as FlowMarks does for
 * the flow. Decorative: the caption carries the names and the figures.
 *
 * `focus` lights one number (the others dim), as the caption row under the
 * pointer lights the same thing in the picture.
 */

export type MarkTone = TransmissionTone | 'violet';

export interface ViewMark {
  id: string;
  /** The world point the number sits on. */
  at: Vec3;
  tone: MarkTone;
}

const RING: Record<MarkTone, string> = {
  gain: 'border-gain-fill',
  loss: 'border-loss-fill',
  neutral: 'border-fg/40',
  violet: 'border-primary-300',
};

/** The badge every numbered row and mark shares (the flow's list uses the same shape). */
export const MARK_BADGE =
  'flex size-[1.125rem] flex-shrink-0 items-center justify-center rounded-full border font-mono-data text-[0.625rem] font-semibold leading-none text-ink';

export interface ViewMarksProps {
  marks: readonly ViewMark[];
  box: ViewBox;
  view: SceneAngle;
  /** The view box's width ÷ height. */
  aspect: number;
  focus?: string | null;
  className?: string;
}

export default function ViewMarks({ marks, box, view, aspect, focus = null, className }: ViewMarksProps) {
  if (!marks.length) return null;
  const { at, width, height } = projector(box, view);
  const { place } = placer(width, height, aspect);
  return (
    <div aria-hidden="true" data-decorative="" data-view-marks="" className={cn('pointer-events-none absolute inset-0', className)}>
      {marks.map((m, i) => (
        <span
          key={m.id}
          style={place(at(m.at))}
          className={cn(
            MARK_BADGE,
            'absolute -translate-x-1/2 -translate-y-1/2 bg-surface shadow-[0_2px_8px_-2px_rgb(0_0_0/0.45)] transition-opacity duration-200 ease-civic',
            RING[m.tone],
            focus && focus !== m.id && 'opacity-40',
            focus === m.id && 'ring-2 ring-primary-300/70'
          )}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
