'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshStandardMaterial } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixHex } from '@/lib/three/palette';
import { TERRAIN_VIEW, TERRAIN_WORLD, terrainLayout, terrainViewBox, type TerrainCell } from '@/lib/transmission';
import { ContactBlob } from '@/components/three/kit/Plinth';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';
import TransmissionRig from '@/components/three/scenes/parts/TransmissionRig';
import { paintTone, toneGlass } from '@/components/three/scenes/parts/toneGlass';

/*
 * Spending pressure as a terrain: one glass tile per spending category
 * (spendingVelocity, signed dollars a month), laid out in the page's heatmap
 * order on a slab (porcelain by day, raised night by night, as its poster
 * draws it), each tile rising above its foot as far as its monthly amount on
 * one linear scale (lib/transmission terrainLayout). Colour is the
 * direction, held at its true hue whatever the size: ledger teal where the
 * policy saves the user money, ember amber where it costs more, and plain
 * porcelain at $0. Height carries the size, colour the sign; the page states
 * both.
 *
 * The camera drifts slowly while motion is allowed; under reduced (or
 * paused) motion it is one composed still frame. Decorative: the page lists
 * every category (describeTerrain, terrainScaleNote, the heatmap itself).
 */

export interface SpendingTerrainProps {
  /** From terrainFromAnalysis (lib/transmission.ts). [] draws the empty slab. */
  cells: readonly TerrainCell[];
}

const T = TERRAIN_WORLD;

export default function SpendingTerrain({ cells }: SpendingTerrainProps) {
  const animated = useAnimated(30);
  const p = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  // Keyed on the cells' content, so an equal list rebuilt each render doesn't rebuild the tiles.
  const key = cells.map((c) => `${c.id}:${c.value}:${c.row}:${c.col}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => terrainLayout(cells), [key]);
  const box = useMemo(() => terrainViewBox(layout), [layout]);

  const geo = useMemo(() => {
    const slab = new RoundedBoxGeometry(layout.halfX * 2, T.slab.thickness, layout.halfZ * 2, 3, 0.03);
    slab.translate(0, -T.slab.thickness / 2, 0);
    const tiles = layout.tiles.map((t) => {
      const g = new RoundedBoxGeometry(T.tile, t.height, T.tile, 2, Math.min(0.022, t.height * 0.45));
      g.translate(0, t.height / 2, 0);
      return g;
    });
    return { slab, tiles };
  }, [layout]);
  useEffect(
    () => () => {
      geo.slab.dispose();
      geo.tiles.forEach((g) => g.dispose());
    },
    [geo]
  );

  const slabMaterial = useMemo(() => new MeshStandardMaterial({ roughness: 0.72, metalness: 0, emissive: '#000000' }), []);
  useEffect(() => () => slabMaterial.dispose(), [slabMaterial]);
  const tileMaterials = useMemo(() => layout.tiles.map(() => toneGlass()), [layout]);
  useEffect(() => () => tileMaterials.forEach((m) => m.dispose()), [tileMaterials]);

  useEffect(() => {
    // By night a raised night slab (not the lilac paper), so the tiles, porcelain $0 ones too, stand out from it.
    slabMaterial.color.set(p.night ? mixHex(p.surface, p.violet, 0.07) : p.porcelain);
    slabMaterial.emissive.set(p.night ? p.surface : p.porcelain);
    slabMaterial.emissiveIntensity = p.night ? 0.25 : 0.1;
    layout.tiles.forEach((t, i) => {
      const m = tileMaterials[i];
      if (m) paintTone(m, p, t.tone, { glow: 0.4 });
    });
    invalidate();
  }, [p, layout, tileMaterials, slabMaterial, invalidate]);

  return (
    <>
      <TransmissionRig view={TERRAIN_VIEW} box={box} animated={animated} drift={0.05} lean={0.09} />
      <StudioLights />
      <ContactBlob width={layout.halfX * 3} depth={layout.halfZ * 3} position={[0, -T.slab.thickness - 0.004, 0]} strength={1.1} />
      <mesh geometry={geo.slab} material={slabMaterial} />
      {layout.tiles.map((t, i) => (
        <mesh key={t.id} geometry={geo.tiles[i]} material={tileMaterials[i]} position={[t.x, 0, t.z]} renderOrder={2} />
      ))}
    </>
  );
}
