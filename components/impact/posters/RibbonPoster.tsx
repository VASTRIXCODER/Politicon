import { RIBBON_FRONT, RIBBON_VIEW, RIBBON_WORLD, ribbonLayout, ribbonPath, ribbonViewBox, type RibbonPoint, type TransmissionTone } from '@/lib/transmission';
import { PosterSvg, TONE_STROKE, line, path, projector, r1, S, type Pt } from '@/components/impact/posters/draw';

/*
 * The timeline ribbon as a server-rendered drawing (the TimelineRibbon
 * scene's poster): the same world and angle (lib/transmission RIBBON_WORLD,
 * RIBBON_VIEW, ribbonLayout, ribbonPath), flattened. The translucent zero
 * plate with a mark per month, the staff, a fine drop line and a bead per
 * month, and the upright glass band around the running total, as wide as
 * the uncertainty (facing the viewer, as in the scene), with its line of
 * light in front of it, teal while the total is a saving and amber while
 * it's a cost. `focus` lights a month, as the scene does.
 * Decorative (the page states the months and the legend).
 */

export interface RibbonPosterProps {
  points: readonly RibbonPoint[];
  focus?: number | null;
  className?: string;
}

const R = RIBBON_WORLD;
/** A bead in its month's colour (violet at exactly $0). */
const BEAD_FILL = { gain: 'fill-gain-fill', loss: 'fill-loss-fill', neutral: 'fill-primary' } as const;
const signOf = (y: number): TransmissionTone => (y > 1e-6 ? 'gain' : y < -1e-6 ? 'loss' : 'neutral');

export default function RibbonPoster({ points, focus = null, className }: RibbonPosterProps) {
  const layout = ribbonLayout(points);
  const { at, width, height } = projector(ribbonViewBox(layout), RIBBON_VIEW);
  const spine = ribbonPath(points, layout, 10);
  const front = RIBBON_FRONT;
  const w = layout.width / 2;
  const d = R.plate.depth / 2;
  const plate = [at([R.plate.x0, 0, -d]), at([R.plate.x1, 0, -d]), at([R.plate.x1, 0, d]), at([R.plate.x0, 0, d])];
  // The band's front face: half its width above the line and half below.
  const band = spine.length > 1 ? [...spine.map(([x, y]) => at([x, y + w, R.thickness / 2])), ...[...spine].reverse().map(([x, y]) => at([x, y - w, R.thickness / 2]))] : [];

  // The line of light, in runs of one sign.
  const runs: { tone: TransmissionTone; pts: Pt[] }[] = [];
  for (let i = 0; i < spine.length - 1; i++) {
    const [x0, y0] = spine[i];
    const [x1, y1] = spine[i + 1];
    const tone = signOf((y0 + y1) / 2);
    const last = runs[runs.length - 1];
    const a = at([x0, y0, front]);
    const b = at([x1, y1, front]);
    if (last && last.tone === tone) last.pts.push(b);
    else runs.push({ tone, pts: [a, b] });
  }

  const lit = points.find((p) => p.month === focus) ?? null;
  const staffTop = Math.max(0, ...layout.ticks);
  const staffBottom = Math.min(0, ...layout.ticks);
  // The ring stands upright (facing the viewer), so it's seen nearly round.
  const ry = Math.cos(RIBBON_VIEW.pitch);

  return (
    <PosterSvg width={width} height={height} className={className}>
      {/* The zero plate, its front edge (zero) and a mark per month. */}
      <path d={path(plate)} className="fill-primary/[0.05] stroke-fg/10" strokeWidth={1} />
      <path d={line([plate[3], plate[2]])} className="stroke-muted/70" strokeWidth={1.5} />
      {Array.from({ length: 12 }, (_, i) => {
        const x = layout.x(i + 1);
        const long = i === 0 || i === 11 ? 0.07 : 0.045;
        return <path key={i} d={line([at([x, 0, d - 0.03 - long / 2]), at([x, 0, d - 0.03 + long / 2])])} className="stroke-muted/60" strokeWidth={1.25} />;
      })}

      {layout.scale && (
        <g fill="none" strokeLinecap="round">
          <path d={line([at([R.staff.x, staffBottom, 0]), at([R.staff.x, staffTop, 0])])} className="stroke-muted/60" strokeWidth={2} />
          {layout.ticks.map((y) => {
            const t = Math.abs(y) < 1e-6 ? R.staff.tick * 0.8 : R.staff.tick / 2;
            return <path key={y.toFixed(4)} d={line([at([R.staff.x - t, y, 0]), at([R.staff.x + t, y, 0])])} className="stroke-muted/80" strokeWidth={Math.abs(y) < 1e-6 ? 2 : 1.5} />;
          })}
        </g>
      )}

      {points.map((p) => {
        const x = layout.x(p.month);
        const y = layout.y(p.value);
        return <path key={p.month} d={line([at([x, 0, front]), at([x, y, front])])} className={p.month === lit?.month ? 'stroke-primary' : 'stroke-muted/50'} strokeWidth={p.month === lit?.month ? 2 : 1} />;
      })}

      {band.length > 0 && <path d={path(band)} className="fill-primary/[0.16] stroke-primary/50" strokeWidth={1} strokeLinejoin="round" />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {runs.map((r, i) => (
          <path key={i} d={line(r.pts)} className={TONE_STROKE[r.tone]} strokeWidth={3} />
        ))}
      </g>

      {points.map((p) => {
        const y = layout.y(p.value);
        const [cx, cy] = at([layout.x(p.month), y, front]);
        return <circle key={p.month} cx={r1(cx)} cy={r1(cy)} r={r1(0.022 * S)} className={BEAD_FILL[signOf(y)]} />;
      })}
      {lit && (() => {
        const y = layout.y(lit.value);
        const [cx, cy] = at([layout.x(lit.month), y, front]);
        const tone = signOf(y);
        return (
          <g>
            {/* The ring faces the viewer, as in the scene. */}
            <ellipse cx={r1(cx)} cy={r1(cy)} rx={r1(0.075 * S)} ry={r1(0.075 * ry * S)} fill="none" className="stroke-violet-glow" strokeOpacity={0.75} strokeWidth={4} />
            <circle cx={r1(cx)} cy={r1(cy)} r={r1(0.042 * S)} className={BEAD_FILL[tone]} />
          </g>
        );
      })()}
    </PosterSvg>
  );
}
