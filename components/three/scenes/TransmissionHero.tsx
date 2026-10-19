'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { CylinderGeometry, MeshPhysicalMaterial, Color } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HERO_VIEW, HERO_WORLD, heroInEffect, heroLayout, heroStreams, heroViewBox, type HeroLayout } from '@/lib/transmission';
import BillSheet from '@/components/three/kit/BillSheet';
import LightParticles from '@/components/three/kit/LightParticles';
import Plinth, { ContactBlob } from '@/components/three/kit/Plinth';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import ScaleStaff from '@/components/three/scenes/parts/ScaleStaff';
import TransmissionRig from '@/components/three/scenes/parts/TransmissionRig';
import { paintTone, toneGlass } from '@/components/three/scenes/parts/toneGlass';
import { vitrinePlinth, vitrineStand } from '@/components/three/scenes/parts/vitrine';

/*
 * "The Transmission" (the policy detail page's hero): the bill as the kit's
 * glass BillSheet, standing on a plinth, and beside it its net yearly
 * effect on this person as a column of glass measured from a zero shelf
 * held by the scale staff, as tall as the dollars on a linear scale whose
 * steps the staff marks (lib/transmission heroLayout, which the poster draws
 * too). For money it saves them, ledger teal stands on the shelf at the
 * column's foot and rises; for money it costs them, the shelf is raised to
 * the top of the scale's reach and ember amber hangs beneath it, clear of
 * the plinth: below zero by its form, not only its colour. Light leaves the
 * sheet and travels into the column: for a gain it runs low across the
 * plinth and rises up through the teal; for a cost it climbs to the raised
 * shelf and sinks down through the amber. $0 is an empty shelf on the foot,
 * with no light travelling.
 *
 * A law in effect (`status` 'enacted') is lit from within; any other status
 * is the same column, dimmer: what the bill would mean if enacted. The camera
 * drifts slowly and leans after a mouse; under reduced (or paused) motion it
 * is one composed still frame, the light held where it is. Decorative: the
 * page says the amount, its sign and its words (describeTransmission).
 */

export interface TransmissionHeroProps {
  /** Signed dollars a year (FullAnalysis.netAnnualImpact): + saves the user money, − costs them. */
  netAnnualImpact: number;
  /** The policy's status (FullAnalysis.status). Only 'enacted' lights the column fully. */
  status?: string;
  /** The bill's title: for the page's label (describeTransmission); nothing is printed in 3D. */
  title?: string;
  /**
   * Whether the bill is verified against its official record (FullAnalysis.record.verified).
   * Only then does the sheet carry the archive-gold seal. Default false.
   */
  verified?: boolean;
}

const S = HERO_WORLD.sheet;
const C = HERO_WORLD.column;
const SH = HERO_WORLD.shelf;
const STAFF_X = C.x + HERO_WORLD.staff.dx;

/** The column: its porcelain foot, the zero shelf reaching to the staff, and the slab of teal or amber. */
function Column({ layout, lit }: { layout: HeroLayout; lit: boolean }) {
  const p = useScenePalette();
  const h = Math.max(0, Math.abs(layout.end - layout.baseline) - C.gap / 2);
  const geo = useMemo(() => {
    const foot = new CylinderGeometry(C.width * 0.78, C.width * 0.84, C.pedestal, 48);
    foot.translate(0, C.pedestal / 2, 0);
    // From the column's far edge to just past the staff, so the staff visibly holds it.
    const x0 = C.x - C.width / 2 - SH.overhang;
    const x1 = STAFF_X + 0.025;
    const shelf = new RoundedBoxGeometry(x1 - x0, SH.thickness, C.width + SH.overhang * 2, 2, 0.006);
    shelf.translate((x0 + x1) / 2 - C.x, 0, 0);
    const slab = h > 0 ? new RoundedBoxGeometry(C.width, h, C.width, 2, Math.min(0.016, h * 0.45)) : null;
    return { foot, shelf, slab };
  }, [h]);
  useEffect(() => () => Object.values(geo).forEach((g) => g?.dispose()), [geo]);

  const mats = useMemo(
    () => ({
      slab: toneGlass(),
      stand: new MeshPhysicalMaterial({ roughness: 0.55, metalness: 0, clearcoat: 0.5, emissive: new Color() }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    if (layout.tone !== 'neutral') paintTone(mats.slab, p, layout.tone, { glow: lit ? 0.7 : 0.15 });
    const stand = vitrineStand(p);
    mats.stand.color.set(stand);
    mats.stand.emissive.set(p.night ? p.violet : '#000000');
    mats.stand.emissiveIntensity = p.night ? 0.1 : 0;
  }, [mats, p, layout.tone, lit]);

  // The slab's centre: above the shelf for a gain, below it for a cost.
  const slabY = layout.tone === 'loss' ? layout.baseline - SH.thickness / 2 - h / 2 : layout.baseline + SH.thickness / 2 + h / 2;
  return (
    <group position={[C.x, 0, C.z]}>
      <ContactBlob width={C.width * 2.6} depth={C.width * 2.6} strength={1.1} />
      <mesh geometry={geo.foot} material={mats.stand} />
      <mesh geometry={geo.shelf} material={mats.stand} position={[0, layout.baseline, 0]} renderOrder={3} />
      {geo.slab && <mesh geometry={geo.slab} material={mats.slab} position={[0, slabY, 0]} renderOrder={2} />}
    </group>
  );
}

export default function TransmissionHero({ netAnnualImpact, status, verified = false }: TransmissionHeroProps) {
  // 30 fps on every tier: the motion is slow.
  const animated = useAnimated(30);
  const tier = useKitTier();
  const palette = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  const layout = useMemo(() => heroLayout(netAnnualImpact), [netAnnualImpact]);
  const box = useMemo(heroViewBox, []);
  const curves = useMemo(() => heroStreams(layout).map((c) => c.map((v): [number, number, number] => [v[0], v[1], v[2]])), [layout]);
  const inEffect = heroInEffect(status);
  // Without the animation clock (reduced motion), a new amount, status or theme still needs a frame.
  useEffect(() => invalidate(), [layout, inEffect, palette, invalidate]);

  // The staff holds the shelf: up to just above a cost's raised shelf, or to the scale's top for a gain.
  const staffTop = layout.tone === 'loss' ? layout.baseline + 0.05 : C.pedestal + C.region;
  return (
    <>
      <TransmissionRig view={HERO_VIEW} box={box} animated={animated} />
      <StudioLights />
      <Plinth radius={HERO_WORLD.plinth.radius} height={HERO_WORLD.plinth.height} shadowSpread={2.4} color={vitrinePlinth(palette)} />
      <ContactBlob width={0.95} depth={0.34} position={[S.position[0], 0.002, S.position[2]]} rotationY={S.rotationY} strength={palette.night ? 0.4 : 0.8} />
      <BillSheet material="glass" position={[...S.position]} rotation={[0, S.rotationY, 0]} scale={S.scale} seal={verified} />
      <Column layout={layout} lit={inEffect} />
      <ScaleStaff x={STAFF_X} z={C.z} from={0} to={staffTop} ticks={layout.ticks} zero={layout.baseline} radius={HERO_WORLD.staff.radius} tick={HERO_WORLD.staff.tick} />
      {curves.length > 0 && (
        <LightParticles
          curves={curves}
          count={tier === 2 ? 1100 : 460}
          color={layout.tone === 'gain' ? palette.gain : palette.loss}
          speed={0.07}
          spread={0.03}
          size={34}
          opacity={inEffect ? 0.85 : 0.65}
        />
      )}
    </>
  );
}
