'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type InstancedMesh,
  type Mesh,
} from 'three';
import { mixHex } from '@/lib/three/palette';
import { RIBBON_FRONT, RIBBON_VIEW, RIBBON_WORLD, ribbonLayout, ribbonPath, ribbonViewBox, type RibbonPoint } from '@/lib/transmission';
import GlassMaterial from '@/components/three/kit/GlassMaterial';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';
import ScaleStaff from '@/components/three/scenes/parts/ScaleStaff';
import TransmissionRig from '@/components/three/scenes/parts/TransmissionRig';

/*
 * The timeline: the first year as a glass ribbon rising and falling in 3D.
 * Its spine is the running total month by month (timeline.monthly, which is
 * cumulative), on a linear scale above a translucent zero plate; a line of
 * light runs along it, ledger teal while the total is a saving and ember
 * amber while it's a cost; every month has a bead and a fine drop line to
 * the plate. Between months the ribbon follows a monotone curve
 * (lib/transmission ribbonPath), so it never invents a peak.
 *
 * Its WIDTH is the uncertainty: 1 − confidence, the same all year (the
 * analysis has one confidence score), widest when the confidence wasn't
 * rated. The glass stands upright around the line of light, facing the
 * camera, so the width is seen at its full size; the line and the beads sit
 * just in front of it. The page's legend says "wider = less certain" and
 * draws the widths in proportion. `focus` lights one month: a larger bead
 * with a ring of light, and a brighter drop line.
 *
 * While motion is allowed a small glint travels the spine now and then and
 * the camera drifts; under reduced (or paused) motion it is one composed
 * still frame. Decorative: the page states the months (describeRibbon,
 * ribbonScaleNote, and the chart's "View as table").
 */

export interface TimelineRibbonProps {
  /** From ribbonFromAnalysis (lib/transmission.ts). */
  points: readonly RibbonPoint[];
  /** A month (1 … 12) to light, or null. */
  focus?: number | null;
}

const R = RIBBON_WORLD;
const dt20 = (delta: number) => Math.min(delta, 1 / 20);

/**
 * The glass band: a thin upright slab around the spine, `width` tall (world
 * y, centred on the running total) and `thickness` deep (z), facing the
 * camera, with its own normals.
 */
function bandGeometry(path: [number, number][], width: number, thickness: number): BufferGeometry {
  const n = path.length;
  const w = width / 2;
  const t = thickness / 2;
  // Per sample: the unit normal of the spine (in x, y), for the band's top and bottom edges.
  const up = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l] as const;
  });
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  // Four faces, each with its own vertices (so their normals stay crisp): front, back, top edge, bottom edge.
  // Per sample, two vertices (a, b), wound so that (a, next a, next b) faces out.
  type V = [number, number, number];
  const faces: { at: (x: number, y: number) => [V, V]; normal: (i: number) => V }[] = [
    { at: (x, y) => [[x, y - w, t], [x, y + w, t]], normal: () => [0, 0, 1] },
    { at: (x, y) => [[x, y + w, -t], [x, y - w, -t]], normal: () => [0, 0, -1] },
    { at: (x, y) => [[x, y + w, t], [x, y + w, -t]], normal: (i) => [up[i][0], up[i][1], 0] },
    { at: (x, y) => [[x, y - w, -t], [x, y - w, t]], normal: (i) => [-up[i][0], -up[i][1], 0] },
  ];
  for (const f of faces) {
    const base = pos.length / 3;
    path.forEach(([x, y], i) => {
      for (const v of f.at(x, y)) {
        pos.push(...v);
        nor.push(...f.normal(i));
      }
    });
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      const b = a + 1;
      const d = a + 2;
      const c = a + 3;
      idx.push(a, d, c, a, c, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setIndex(idx);
  return g;
}

export default function TimelineRibbon({ points, focus = null }: TimelineRibbonProps) {
  const animated = useAnimated(30);
  const p = useScenePalette();
  const invalidate = useThree((s) => s.invalidate);
  // Keyed on the points' content, so an equal list rebuilt each render doesn't rebuild the ribbon.
  const key = points.map((x) => `${x.month}:${x.value}:${x.uncertainty}`).join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => ribbonLayout(points), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const path = useMemo(() => ribbonPath(points, layout, 10), [layout]);
  const box = useMemo(() => ribbonViewBox(layout), [layout]);
  const beads = useRef<InstancedMesh>(null);
  const drops = useRef<InstancedMesh>(null);
  const ticks = useRef<InstancedMesh>(null);
  const focusBead = useRef<Mesh>(null);
  const focusRing = useRef<Mesh>(null);
  const focusDrop = useRef<Mesh>(null);
  const glint = useRef<Mesh>(null);
  const clock = useRef({ t: 0, lit: 0, x: 0, y: 0 });

  const geo = useMemo(() => {
    const band = path.length > 1 ? bandGeometry(path, layout.width, R.thickness) : null;
    const spine =
      path.length > 1
        ? new TubeGeometry(new CatmullRomCurve3(path.map(([x, y]) => new Vector3(x, y, RIBBON_FRONT))), path.length * 2, 0.007, 6, false)
        : null;
    const plate = new PlaneGeometry(R.plate.x1 - R.plate.x0, R.plate.depth);
    plate.rotateX(-Math.PI / 2);
    plate.translate((R.plate.x0 + R.plate.x1) / 2, -0.002, 0);
    // Facing the camera, around the lit bead.
    const ring = new RingGeometry(0.06, 0.085, 48);
    return { band, spine, plate, ring, bar: new BoxGeometry(1, 1, 1), bead: new SphereGeometry(1, 16, 12) };
  }, [path, layout.width]);
  useEffect(() => () => Object.values(geo).forEach((g) => g?.dispose()), [geo]);

  const mats = useMemo(
    () => ({
      spine: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      plate: new MeshBasicMaterial({ transparent: true, depthWrite: false }),
      line: new MeshBasicMaterial({ transparent: true }),
      bead: new MeshBasicMaterial({ toneMapped: false }),
      focus: new MeshBasicMaterial({ toneMapped: false }),
      ring: new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
      glint: new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const tones = useMemo(() => ({ gain: new Color(p.gain), loss: new Color(p.loss), zero: new Color(p.night ? p.violetLight : p.violet) }), [p]);
  const toneOf = (y: number) => (y > 1e-6 ? tones.gain : y < -1e-6 ? tones.loss : tones.zero);

  // The spine's colour follows the sign of the running total under it.
  useLayoutEffect(() => {
    const g = geo.spine;
    if (!g) return;
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) toneOf(pos.getY(i)).toArray(colors, i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, tones]);

  useEffect(() => {
    const base = p.night ? p.paper : p.porcelain;
    mats.plate.color.set(mixHex(base, p.violet, p.night ? 0.3 : 0.12));
    mats.plate.opacity = p.night ? 0.12 : 0.32;
    mats.line.color.set(mixHex(base, p.ink, p.night ? 0.4 : 0.42));
    mats.line.opacity = p.night ? 0.55 : 0.6;
    mats.ring.color.set(p.night ? p.violetLight : p.glow);
    mats.glint.color.set(p.night ? '#FFFFFF' : p.glow);
  }, [mats, p]);

  // Beads, drop lines and the plate's month marks.
  useLayoutEffect(() => {
    const o = new Object3D();
    points.forEach((pt, i) => {
      const x = layout.x(pt.month);
      const y = layout.y(pt.value);
      o.position.set(x, y, RIBBON_FRONT);
      o.scale.setScalar(0.022);
      o.updateMatrix();
      beads.current?.setMatrixAt(i, o.matrix);
      beads.current?.setColorAt(i, toneOf(y));
      const h = Math.abs(y);
      o.position.set(x, y / 2, RIBBON_FRONT);
      o.scale.set(0.004, Math.max(0.0005, h), 0.004);
      o.updateMatrix();
      drops.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [beads.current, drops.current]) {
      if (!m) continue;
      m.count = points.length;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (ticks.current) {
      for (let month = 1; month <= 12; month++) {
        o.position.set(layout.x(month), 0.001, R.plate.depth / 2 - 0.03);
        o.scale.set(0.006, 0.002, month === 1 || month === 12 ? 0.07 : 0.045);
        o.updateMatrix();
        ticks.current.setMatrixAt(month - 1, o.matrix);
      }
      ticks.current.instanceMatrix.needsUpdate = true;
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, tones, invalidate]);

  const lit = points.find((pt) => pt.month === focus) ?? null;
  useEffect(() => invalidate(), [lit, p, invalidate]);

  useFrame((_, delta) => {
    const dt = dt20(delta);
    const s = clock.current;
    // The focus mark eases between months (lands at once without motion).
    if (lit) {
      const gx = layout.x(lit.month);
      const gy = layout.y(lit.value);
      const k = animated && s.lit > 0 ? 1 - Math.exp(-dt * 8) : 1;
      s.x += (gx - s.x) * k;
      s.y += (gy - s.y) * k;
      s.lit = Math.min(1, s.lit + (animated ? dt * 4 : 1));
      if (Math.abs(gx - s.x) + Math.abs(gy - s.y) > 1e-4) invalidate();
      const color = toneOf(gy);
      mats.focus.color.copy(color);
      focusBead.current?.position.set(s.x, s.y, RIBBON_FRONT);
      focusRing.current?.position.set(s.x, s.y, RIBBON_FRONT + 0.002);
      focusDrop.current?.position.set(s.x, s.y / 2, RIBBON_FRONT);
      focusDrop.current?.scale.set(0.007, Math.max(0.0005, Math.abs(s.y)), 0.007);
      mats.ring.opacity = (p.night ? 0.8 : 0.65) * s.lit;
    } else {
      s.lit = 0;
    }
    // A glint that travels the spine every few seconds, only while motion is allowed.
    const g = glint.current;
    if (g) {
      if (animated && path.length > 1) {
        s.t += dt;
        const cycle = (s.t % 9) / 6.5;
        const on = cycle < 1;
        g.visible = on;
        if (on) {
          const f = cycle * (path.length - 1);
          const i = Math.floor(f);
          const a = path[i];
          const b = path[Math.min(path.length - 1, i + 1)];
          const u = f - i;
          g.position.set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, RIBBON_FRONT + 0.004);
          mats.glint.opacity = Math.sin(Math.PI * cycle) * (p.night ? 0.9 : 0.7);
        }
      } else {
        g.visible = false;
      }
    }
  });

  const tickYs = layout.ticks;
  const staffFrom = Math.min(0, ...tickYs);
  const staffTo = Math.max(0, ...tickYs);
  return (
    <>
      <TransmissionRig view={RIBBON_VIEW} box={box} animated={animated} drift={0.06} />
      <StudioLights />
      <mesh geometry={geo.plate} material={mats.plate} renderOrder={1} />
      {/* The zero line along the plate's front edge, and a mark per month. */}
      <mesh geometry={geo.bar} material={mats.line} position={[(R.plate.x0 + R.plate.x1) / 2, 0, R.plate.depth / 2]} scale={[R.plate.x1 - R.plate.x0, 0.003, 0.005]} />
      <instancedMesh ref={ticks} args={[geo.bar, mats.line, 12]} frustumCulled={false} />
      {layout.scale && (
        <ScaleStaff x={R.staff.x} z={R.staff.z} from={staffFrom} to={staffTo} ticks={tickYs.filter((y) => Math.abs(y) > 1e-6)} zero={0} radius={R.staff.radius} tick={R.staff.tick} grounded={false} />
      )}
      <instancedMesh ref={drops} args={[geo.bar, mats.line, 12]} frustumCulled={false} />
      {geo.band && (
        <mesh geometry={geo.band} renderOrder={3}>
          <GlassMaterial thickness={0.1} />
        </mesh>
      )}
      {geo.spine && <mesh geometry={geo.spine} material={mats.spine} renderOrder={4} />}
      <instancedMesh ref={beads} args={[geo.bead, mats.bead, 12]} frustumCulled={false} renderOrder={5} />
      {lit && (
        <>
          <mesh ref={focusDrop} geometry={geo.bar} material={mats.focus} renderOrder={5} />
          <mesh ref={focusBead} geometry={geo.bead} material={mats.focus} scale={0.042} renderOrder={6} />
          <mesh ref={focusRing} geometry={geo.ring} material={mats.ring} renderOrder={7} />
        </>
      )}
      <mesh ref={glint} geometry={geo.bead} material={mats.glint} scale={0.03} visible={false} renderOrder={8} />
    </>
  );
}
