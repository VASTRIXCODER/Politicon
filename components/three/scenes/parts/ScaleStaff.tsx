'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, Object3D, type InstancedMesh } from 'three';
import { mixHex } from '@/lib/three/palette';
import { ContactBlob } from '@/components/three/kit/Plinth';
import { useScenePalette } from '@/components/three/kit/hooks';

/*
 * A slim graphite staff standing beside a measured object, with a mark per
 * step of its linear scale and a longer one at zero. The page names the
 * step ("each mark is $500 a year"); the staff only shows where they fall.
 */

export interface ScaleStaffProps {
  x: number;
  z: number;
  /** World y of the staff's foot and top. */
  from: number;
  to: number;
  /** World y of each mark. */
  ticks: readonly number[];
  /** World y of the zero mark (drawn longer), if it is on the staff. */
  zero?: number | null;
  radius?: number;
  /** Length of a mark. */
  tick?: number;
  /** A soft shadow at the foot (when it stands on a surface). */
  grounded?: boolean;
}

const MAX_TICKS = 16;

export default function ScaleStaff({ x, z, from, to, ticks, zero = null, radius = 0.007, tick = 0.06, grounded = true }: ScaleStaffProps) {
  const p = useScenePalette();
  const marks = useRef<InstancedMesh>(null);
  const height = Math.max(0.001, to - from);

  const geo = useMemo(() => {
    const staff = new CylinderGeometry(radius, radius, height, 10);
    staff.translate(0, height / 2, 0);
    return { staff, bar: new BoxGeometry(1, 1, 1) };
  }, [radius, height]);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const material = useMemo(() => new MeshStandardMaterial({ roughness: 0.6, metalness: 0 }), []);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.color.set(mixHex(p.night ? p.paper : p.porcelain, p.ink, p.night ? 0.35 : 0.45));
  }, [material, p]);

  const key = ticks.map((t) => t.toFixed(4)).join(',');
  useLayoutEffect(() => {
    const mesh = marks.current;
    if (!mesh) return;
    const o = new Object3D();
    const all = [...(zero === null ? [] : [zero]), ...ticks].slice(0, MAX_TICKS);
    all.forEach((y, i) => {
      const long = zero !== null && i === 0;
      o.position.set(x, y, z);
      o.scale.set(long ? tick * 1.6 : tick, long ? 0.007 : 0.005, 0.012);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.count = all.length;
    mesh.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, zero, x, z, tick]);

  return (
    <>
      {grounded && <ContactBlob width={0.12} depth={0.12} position={[x, from + 0.002, z]} strength={0.9} />}
      <mesh geometry={geo.staff} material={material} position={[x, from, z]} />
      <instancedMesh ref={marks} args={[geo.bar, material, MAX_TICKS]} frustumCulled={false} />
    </>
  );
}
