'use client';

import { DioramaPlinth, SampleHousehold, useDioramaLight, useDioramaMaterials, useSharedGeometry, type Driven } from '@/components/three/kit/dioramaParts';

/*
 * The landing film's household in miniature (the kit's HouseholdDiorama with
 * no `household`): the gabled house, two figures by the path, the car and the
 * tree on the paper plinth. Its own module, built from the diorama's shared
 * parts (dioramaParts.tsx), so the film's chunk carries none of a person's
 * household (their other buildings, their debts, pieces rising in).
 */

export interface SampleDioramaProps {
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
  /** Lamplight 0 (day: the panes are glass) … 1 (evening). A function is read every frame. */
  glow?: Driven;
  /** Daylight 0 … dusk 1: by day the porcelain carries a little of its own light, so it reads white under the flat stage. */
  dusk?: Driven;
  /** Stand on the paper plinth (default true). */
  plinth?: boolean;
}

export default function SampleDiorama({ position = [0, 0, 0], rotationY = 0, scale = 1, glow = 0, dusk = 0, plinth = true }: SampleDioramaProps) {
  const materials = useDioramaMaterials();
  const geo = useSharedGeometry();
  useDioramaLight(materials, glow, dusk);
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {plinth && <DioramaPlinth />}
      <SampleHousehold mats={materials.mats} geo={geo} />
    </group>
  );
}
