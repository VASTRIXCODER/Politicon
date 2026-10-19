'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, CylinderGeometry, DoubleSide, MeshBasicMaterial } from 'three';
import { mixHex } from '@/lib/three/palette';
import { SANKEY_VIEW, SANKEY_WORLD, sankeyLayout, sankeyStreams, sankeyViewBox, type TransmissionFlow } from '@/lib/transmission';
import BillSheet from '@/components/three/kit/BillSheet';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import LightParticles from '@/components/three/kit/LightParticles';
import Plinth from '@/components/three/kit/Plinth';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import TransmissionRig from '@/components/three/scenes/parts/TransmissionRig';
import { paintTone, toneGlass, toneHex } from '@/components/three/scenes/parts/toneGlass';
import { vitrinePlinth } from '@/components/three/scenes/parts/vitrine';

/*
 * The overview's flow (a particle Sankey): one glass channel per category
 * between the bill (the kit's glass BillSheet, on a plinth at the left) and
 * "your budget", a glass vessel on a plinth at the right. Each channel is a
 * slat as tall as its yearly dollars (lib/transmission sankeyLayout: one
 * linear scale for every channel), gains in ledger teal above, costs in
 * ember amber below, and carries a band of light streams as wide as the
 * slat, so a flow twice the dollars is twice the light. A gain's light
 * leaves the bill and pours into the vessel's mouth; a cost's drains out of
 * the vessel's foot and runs back to the bill, so the direction carries the
 * meaning in a still frame too. The light pooled in the vessel takes the
 * net's colour. The page numbers the channels beside the view, matching its
 * list; `focus` (a list row pointed at) lights one channel and dims the rest.
 *
 * Calm, not a firework: a few thousand slow motes on tight paths (fewer on
 * tier 1), one draw call per colour. Under reduced (or paused) motion the
 * motes hold still along their paths and the camera holds its frame.
 * Decorative: the page lists every flow with its sign and words
 * (describeFlows, flowScaleNote).
 */

export interface FlowSankeyProps {
  /** From flowsFromAnalysis (lib/transmission.ts). [] draws the bill, an empty rail and an empty vessel. */
  flows: readonly TransmissionFlow[];
  /** Whether the bill is verified against its official record: only then does its sheet carry the gold seal. Default false. */
  verified?: boolean;
  /** A flow's id to light (its list row is pointed at), or null. */
  focus?: string | null;
}

const G = SANKEY_WORLD.gates;
const B = SANKEY_WORLD.basin;
const ST = SANKEY_WORLD.stand;
const [BX, BY, BZ] = SANKEY_WORLD.bill.position;

function Gates({ layout, focus }: { layout: ReturnType<typeof sankeyLayout>; focus: string | null }) {
  const p = useScenePalette();
  const geo = useMemo(
    () => ({
      slat: new BoxGeometry(G.thickness, 1, G.depth),
      rail: new CylinderGeometry(0.006, 0.006, G.span + 0.12, 8),
    }),
    []
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  const mats = useMemo(
    () => ({
      gain: toneGlass(),
      loss: toneGlass(),
      gainLit: toneGlass(),
      lossLit: toneGlass(),
      gainDim: toneGlass(),
      lossDim: toneGlass(),
      rail: new MeshBasicMaterial({ transparent: true }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    paintTone(mats.gain, p, 'gain', { glow: 0.55 });
    paintTone(mats.loss, p, 'loss', { glow: 0.55 });
    paintTone(mats.gainLit, p, 'gain', { glow: 1 });
    paintTone(mats.lossLit, p, 'loss', { glow: 1 });
    // Dimmed by light and opacity, never by another hue.
    paintTone(mats.gainDim, p, 'gain', { glow: 0, opacity: 0.4 });
    paintTone(mats.lossDim, p, 'loss', { glow: 0, opacity: 0.4 });
    mats.rail.color.set(mixHex(p.night ? p.paper : p.porcelain, p.violet, p.night ? 0.5 : 0.35));
    mats.rail.opacity = p.night ? 0.55 : 0.7;
  }, [mats, p]);

  return (
    <>
      {/* The rail the channels hang on, just behind them. */}
      <mesh geometry={geo.rail} material={mats.rail} position={[G.x, 0, -G.depth / 2 - 0.035]} />
      {layout.gates.map((g) => (
        <mesh
          key={g.id}
          geometry={geo.slat}
          material={
            !focus ? (g.tone === 'loss' ? mats.loss : mats.gain)
              : g.id === focus ? (g.tone === 'loss' ? mats.lossLit : mats.gainLit)
                : g.tone === 'loss' ? mats.lossDim : mats.gainDim
          }
          position={[G.x, (g.y0 + g.y1) / 2, 0]}
          scale={[1, Math.max(0.001, g.y1 - g.y0), 1]}
          renderOrder={2}
        />
      ))}
    </>
  );
}

function Basin({ net }: { net: number }) {
  const p = useScenePalette();
  const geo = useMemo(
    () => ({
      wall: new CylinderGeometry(B.radius, B.radius, B.height, 64, 1, true),
      floor: new CylinderGeometry(B.radius, B.radius, 0.02, 64),
      pool: new CylinderGeometry(B.radius * 0.9, B.radius * 0.9, 0.07, 48),
    }),
    []
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);
  // Drawn over the vessel's glass (no depth test): seen through the violet glass, the net's teal or amber would shift hue.
  const pool = useMemo(() => new MeshBasicMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }), []);
  useEffect(() => () => pool.dispose(), [pool]);
  useEffect(() => {
    const tone = net > 0 ? 'gain' : net < 0 ? 'loss' : 'neutral';
    pool.color.set(tone === 'neutral' ? (p.night ? p.violetLight : p.glow) : toneHex(p, tone));
    // Nearly opaque, so the night behind doesn't tint the net's colour.
    pool.opacity = p.night ? 0.82 : 0.7;
  }, [pool, p, net]);

  return (
    <group position={[B.x, ST.top, B.z]}>
      <mesh geometry={geo.floor} position={[0, 0.01, 0]}>
        <GlassMaterial />
      </mesh>
      <mesh geometry={geo.pool} material={pool} position={[0, 0.06, 0]} renderOrder={5} />
      <mesh geometry={geo.wall} position={[0, B.height / 2, 0]} renderOrder={4}>
        <GlassMaterial side={DoubleSide} thickness={0.08} />
      </mesh>
    </group>
  );
}

export default function FlowSankey({ flows, verified = false, focus = null }: FlowSankeyProps) {
  const animated = useAnimated(30);
  const tier = useKitTier();
  const palette = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  // Keyed on the flows' content, so a page that rebuilds an equal list each render doesn't rebuild the scene.
  const key = flows.map((f) => `${f.id}:${f.value}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => sankeyLayout(flows), [key]);
  const curves = useMemo(() => {
    const streams = sankeyStreams(layout);
    const of = (tone: 'gain' | 'loss') =>
      streams.filter((s) => s.tone === tone).map((s) => s.points.map((v): [number, number, number] => [v[0], v[1], v[2]]));
    return { gain: of('gain'), loss: of('loss') };
  }, [layout]);
  const box = useMemo(sankeyViewBox, []);
  useEffect(() => invalidate(), [layout, palette, focus, invalidate]);
  const plinth = vitrinePlinth(palette);

  // The same light per stream on both sides, so the motes stay in proportion to the dollars.
  const perStream = tier === 2 ? 280 : 130;
  return (
    <>
      <TransmissionRig view={SANKEY_VIEW} box={box} animated={animated} drift={0.04} lean={0.08} />
      <StudioLights />
      <Plinth radius={ST.radius} height={ST.height} position={[BX, ST.top, BZ]} shadowSpread={2.2} color={plinth} />
      <BillSheet material="glass" position={[BX, BY, BZ]} rotation={[0, SANKEY_WORLD.bill.rotationY, 0]} scale={SANKEY_WORLD.bill.scale} seal={verified} />
      <Gates layout={layout} focus={focus && layout.gates.some((g) => g.id === focus) ? focus : null} />
      <Plinth radius={ST.radius} height={ST.height} position={[B.x, ST.top, B.z]} shadowSpread={2.2} color={plinth} />
      <Basin net={layout.totals.net} />
      {curves.gain.length > 0 && (
        <LightParticles curves={curves.gain} count={perStream * curves.gain.length} color={palette.gain} speed={0.05} spread={0.01} size={24} opacity={0.85} />
      )}
      {curves.loss.length > 0 && (
        <LightParticles curves={curves.loss} count={perStream * curves.loss.length} color={palette.loss} speed={0.05} spread={0.01} size={24} opacity={0.85} />
      )}
    </>
  );
}
