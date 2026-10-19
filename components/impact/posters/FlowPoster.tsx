import { SANKEY_VIEW, SANKEY_WORLD, sankeyLayout, sankeyStreams, sankeyViewBox, type TransmissionFlow } from '@/lib/transmission';
import { PlinthArt, PosterSvg, ShadowDef, SheetArt, SolidBox, TONE_FILL, TONE_STROKE, boxFaces, line, projector, smooth, r1, S } from '@/components/impact/posters/draw';

/*
 * The overview's flow as a server-rendered drawing (the FlowSankey scene's
 * poster): the same world and angle (lib/transmission SANKEY_WORLD,
 * SANKEY_VIEW, sankeyLayout, sankeyStreams), flattened. The bill on its
 * plinth, one glass channel per category as tall as its yearly dollars
 * (teal gains above, amber costs below), every stream of light that passes
 * through it as a trail of motes (a gain's pouring into the vessel's mouth,
 * a cost's draining from its foot back to the bill), and the glass vessel
 * for your budget with light pooled in the net's colour. `focus` lights one
 * channel, as the scene does. Decorative (the page lists each flow).
 */

export interface FlowPosterProps {
  flows: readonly TransmissionFlow[];
  /** Verified against its official record: only then is the bill's gold seal drawn. Default false. */
  verified?: boolean;
  className?: string;
  /** Prefix for the drawing's gradient ids (only needed with two of these on one page). */
  id?: string;
  /** A flow's id to light (the others dim), or null. */
  focus?: string | null;
}

const G = SANKEY_WORLD.gates;
const B = SANKEY_WORLD.basin;
const ST = SANKEY_WORLD.stand;
const bill = SANKEY_WORLD.bill;

export default function FlowPoster({ flows, verified = false, className, id = 'flow', focus = null }: FlowPosterProps) {
  const { at, width, height } = projector(sankeyViewBox(), SANKEY_VIEW);
  const layout = sankeyLayout(flows);
  const streams = sankeyStreams(layout);
  const net = layout.totals.net;
  const pool = net > 0 ? 'fill-gain-fill' : net < 0 ? 'fill-loss-fill' : 'fill-violet-glow';
  const ry = Math.sin(SANKEY_VIEW.pitch) * S;
  const [mx, my] = at([B.x, ST.top + B.height, B.z]);
  const [lx, ly] = at([B.x, ST.top, B.z]);
  const [, py] = at([B.x, ST.top + 0.08, B.z]);
  const rail = [at([G.x, -G.span / 2 - 0.06, -G.depth / 2 - 0.035]), at([G.x, G.span / 2 + 0.06, -G.depth / 2 - 0.035])];

  return (
    <PosterSvg width={width} height={height} className={className}>
      <ShadowDef id={`${id}-shadow`} />
      <PlinthArt at={at} top={[bill.position[0], ST.top, bill.position[2]]} radius={ST.radius} height={ST.height} pitch={SANKEY_VIEW.pitch} shadow={`${id}-shadow`} />
      <PlinthArt at={at} top={[B.x, ST.top, B.z]} radius={ST.radius} height={ST.height} pitch={SANKEY_VIEW.pitch} shadow={`${id}-shadow`} />
      <SheetArt at={at} position={bill.position} rotationY={bill.rotationY} scale={bill.scale} seal={verified} />

      {/* The rail the channels hang on. */}
      <path d={line(rail)} className="stroke-primary/35" strokeWidth={2} strokeLinecap="round" />

      {/* The streams, as motes on their way. */}
      <g fill="none" strokeLinecap="round" strokeOpacity={0.7}>
        {streams.map((s, i) => (
          <path key={i} d={smooth(s.points.map(at))} className={TONE_STROKE[s.tone]} strokeWidth={2.6} strokeDasharray="0.1 9" />
        ))}
      </g>

      {/* The channels: glass slats as tall as their dollars. */}
      {layout.gates.map((g) => (
        <SolidBox
          key={g.id}
          faces={boxFaces(at, G.x - G.thickness / 2, G.x + G.thickness / 2, g.y0, g.y1, -G.depth / 2, G.depth / 2)}
          fill={TONE_FILL[g.tone]}
          opacity={!focus ? 0.8 : g.id === focus ? 0.95 : 0.35}
          edge={TONE_STROKE[g.tone]}
        />
      ))}

      {/* Your budget: a glass vessel, the light pooled in it in the net's colour. */}
      <g>
        <ellipse cx={r1(lx)} cy={r1(ly)} rx={r1(B.radius * S)} ry={r1(B.radius * ry)} className="fill-primary/[0.08]" />
        <ellipse cx={r1(lx)} cy={r1(py)} rx={r1(B.radius * 0.9 * S)} ry={r1(B.radius * 0.9 * ry)} className={pool} fillOpacity={0.8} />
        <rect x={r1(mx - B.radius * S)} y={r1(my)} width={r1(B.radius * 2 * S)} height={r1(Math.max(0, ly - my))} className="fill-primary/[0.06]" />
        <path d={line([[mx - B.radius * S, my], [lx - B.radius * S, ly]])} className="stroke-primary/40" strokeWidth={1.25} />
        <path d={line([[mx + B.radius * S, my], [lx + B.radius * S, ly]])} className="stroke-primary/40" strokeWidth={1.25} />
        <path d={line([[mx - B.radius * S * 0.7, my + 6], [lx - B.radius * S * 0.7, ly - 4]])} className="stroke-raised" strokeOpacity={0.7} strokeWidth={2} />
        <ellipse cx={r1(mx)} cy={r1(my)} rx={r1(B.radius * S)} ry={r1(B.radius * ry)} fill="none" className="stroke-primary/50" strokeWidth={1.25} />
      </g>
    </PosterSvg>
  );
}
