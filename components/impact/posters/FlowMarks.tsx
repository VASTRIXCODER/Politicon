import { SANKEY_VIEW, sankeyGateMarks, sankeyLayout, sankeyViewBox, type TransmissionFlow } from '@/lib/transmission';
import { line, placer, projector } from '@/components/impact/posters/draw';
import { cn } from '@/lib/utils';

/*
 * The flow's channel numbers, laid over its SceneView (the scene and its
 * poster alike): beside each slat, the number its row has in the page's list,
 * in DOM type at a size that stays readable in any box, with a fine leader
 * line where a thin channel's number had to move off its slat to stay clear
 * of its neighbour (lib/transmission sankeyGateMarks). The box's shape is
 * given (`aspect`, its aspect-* class), so the numbers land where the frame,
 * fitted to the box the way the scene's camera and the poster fit it, puts
 * the slats; no measuring, so it renders on the server. Decorative: the list
 * carries the numbers, names and amounts. Shown from sm up (on a phone the
 * list follows the view in the same top-to-bottom order).
 */

export interface FlowMarksProps {
  flows: readonly TransmissionFlow[];
  /** The view box's width ÷ height. */
  aspect: number;
  /** A flow's id to light (the others dim), or null. */
  focus?: string | null;
}

export default function FlowMarks({ flows, aspect, focus = null }: FlowMarksProps) {
  const layout = sankeyLayout(flows);
  const marks = sankeyGateMarks(layout);
  if (!marks.length) return null;
  const { at, width, height } = projector(sankeyViewBox(), SANKEY_VIEW);
  // The poster's viewBox, fitted into the box ("meet").
  const { vw, vh, place } = placer(width, height, aspect);

  return (
    <div aria-hidden="true" data-decorative="" className="pointer-events-none absolute inset-0 hidden sm:block">
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" focusable="false">
        {marks.map((m) =>
          Math.abs(m.label[1] - m.slat[1]) > 0.01 ? (
            <path key={m.id} d={line([at(m.slat), at(m.label)])} fill="none" className="stroke-fg/40" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ) : null
        )}
      </svg>
      {marks.map((m, i) => (
        <span
          key={m.id}
          style={place(at(m.label))}
          className={cn(
            'absolute flex size-[1.125rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-surface font-mono-data text-[0.625rem] font-semibold leading-none text-ink transition-opacity duration-200 ease-civic',
            m.tone === 'loss' ? 'border-loss-fill' : 'border-gain-fill',
            focus && focus !== m.id && 'opacity-40'
          )}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}
