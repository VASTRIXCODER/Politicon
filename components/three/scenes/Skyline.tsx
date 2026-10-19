'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import {
  BoxGeometry,
  CanvasTexture,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Group,
  type Mesh,
  type PerspectiveCamera as PerspectiveCameraImpl,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { damp } from 'maath/easing';
import { mixHex, type ScenePalette } from '@/lib/three/palette';
import { sceneStore } from '@/lib/three/sceneStore';
import {
  SKYLINE_VIEW,
  SKYLINE_WORLD,
  reachOf,
  skylineFrame,
  skylineLayout,
  unprojectSkyline,
  type SkylineHorizon,
  type SkylineLayout,
  type SkylineReach,
  type SkylineTower,
} from '@/lib/skyline';
import { usePrefersReducedMotion, useViewState } from '@/components/three/runtime';
import { ContactBlob } from '@/components/three/kit/Plinth';
import PostFX from '@/components/three/kit/PostFX';
import StudioLights from '@/components/three/kit/StudioLights';
import { useAnimated, useScenePalette } from '@/components/three/kit/hooks';
import { paintTower, skylineGlass, towerTones } from '@/components/three/scenes/parts/skylineGlass';

/*
 * "The Skyline" (/impact): one glass tower per analyzed policy on a paper
 * street, like an architect's model on a porcelain plinth. Gains rise from
 * the street in ledger teal; costs hang from its underside into a glass
 * well in ember amber (as in the explorer's city). Every height is the
 * policy's cumulative estimate at the chosen horizon (timeline.year1/3/5),
 * linear on one scale shared by all three horizons (lib/skyline.ts), with a
 * floor etched into the glass every round number of dollars, so changing
 * the horizon grows (or sinks) the skyline by the real projections. A $0
 * policy is a flat porcelain tile; one with no projection is an empty lot,
 * a hairline outline on the street. In one row, a numbered plaque on the
 * plinth's front edge under each tower matches the receipt's line number.
 *
 * The page's focus (a receipt line pointed at or focused) lights its tower
 * and dims the rest; pointing at a tower reports it through `onFocus`, so
 * the receipt is the keyboard and screen-reader way into the model. The
 * camera drifts slowly and leans a little after the mouse while motion is
 * allowed; under reduced (or paused) motion it is one composed still frame
 * and towers take their new heights at once.
 *
 * Decorative: the page states every figure (the receipt and the readout).
 */

export interface SkylineProps {
  /** One per policy, in the receipt's order (lib/skyline skylineTowers). */
  towers: readonly SkylineTower[];
  horizon: SkylineHorizon;
  /**
   * The largest gain and cost across every horizon shown (lib/skyline
   * skylineReach), so the scale and the frame hold still while the horizon
   * changes. Default: this horizon's own.
   */
  reach?: SkylineReach;
  /** The lit tower's id (the receipt line pointed at or focused). */
  focus?: string | null;
  /** A tower pointed at (its id), or let go (null). */
  onFocus?: (id: string | null) => void;
}

const W = SKYLINE_WORLD;
/** Tags only where the box is wide enough to read them (the poster drops them on phones, too). */
const TAG_MIN_WIDTH = 520;

// ---------------------------------------------------------------------------
// The camera: the composed angle, stood back just far enough to hold the
// street and the scale's full reach in any box, with a slow drift.

function SkylineRig({ layout, animated }: { layout: SkylineLayout; animated: boolean }) {
  const camera = useRef<PerspectiveCameraImpl>(null);
  const { element } = useViewState();
  const frame = useMemo(() => skylineFrame(layout), [layout]);
  const target = useMemo(() => unprojectSkyline([frame.cx, frame.cy, 0]), [frame]);
  const state = useMemo(() => ({ x: 0, y: 0, t: 0 }), []);

  useFrame((_, delta) => {
    const cam = camera.current;
    if (!cam) return;
    const dt = Math.min(delta, 1 / 20);
    if (animated) {
      const pointer = sceneStore.get().pointer;
      damp(state, 'x', pointer.x, 0.7, dt);
      damp(state, 'y', pointer.y, 0.7, dt);
      state.t += dt;
    } else {
      state.x = 0;
      state.y = 0;
      state.t = 0;
    }
    const w = Math.max(1, element?.clientWidth ?? 1);
    const h = Math.max(1, element?.clientHeight ?? 1);
    const aspect = w / h;
    const tan = Math.tan((SKYLINE_VIEW.fov * Math.PI) / 360);
    const distance = Math.max(frame.halfH / tan, frame.halfW / (tan * aspect)) + frame.near;
    const yaw = SKYLINE_VIEW.yaw + Math.sin(state.t * 0.1) * 0.05 + state.x * 0.06;
    const pitch = SKYLINE_VIEW.pitch - state.y * 0.03 + Math.sin(state.t * 0.07) * 0.008;
    const [tx, ty, tz] = target;
    cam.position.set(
      tx + Math.sin(yaw) * Math.cos(pitch) * distance,
      ty + Math.sin(pitch) * distance,
      tz + Math.cos(yaw) * Math.cos(pitch) * distance
    );
    cam.aspect = aspect;
    cam.near = Math.max(0.05, distance * 0.05);
    cam.far = distance * 4 + 10;
    cam.updateProjectionMatrix();
    cam.lookAt(tx, ty, tz);
  });

  return <PerspectiveCamera ref={camera} makeDefault fov={SKYLINE_VIEW.fov} near={0.1} far={60} position={[0, 1, 8]} />;
}

// ---------------------------------------------------------------------------
// The plinth: the paper street (its top the $0 line, a violet hairline set
// along its front edge), the glass well under it when any cost is in reach,
// and the porcelain foot, over a soft shadow.

function SkylinePlinth({ layout }: { layout: SkylineLayout }) {
  const p = useScenePalette();
  const sx = layout.halfX * 2;
  const sz = layout.halfZ * 2;
  const wellTop = layout.well?.y0 ?? 0;
  const wellBottom = layout.well?.y1 ?? 0;

  const geo = useMemo(() => {
    const street = new RoundedBoxGeometry(sx, W.street, sz, 2, 0.012);
    street.translate(0, -W.street / 2, 0);
    const foot = new RoundedBoxGeometry(sx + 0.03, W.foot, sz + 0.03, 3, 0.022);
    foot.translate(0, layout.bottom + W.foot / 2, 0);
    let well: RoundedBoxGeometry | null = null;
    if (wellTop > wellBottom) {
      well = new RoundedBoxGeometry(sx - 0.02, wellTop - wellBottom, sz - 0.02, 2, 0.01);
      well.translate(0, (wellTop + wellBottom) / 2, 0);
    }
    const inlay = new BoxGeometry(sx - 0.1, 0.002, 0.007);
    inlay.translate(0, 0.0012, sz / 2 - 0.06);
    return { street, foot, well, inlay };
  }, [sx, sz, layout.bottom, wellTop, wellBottom]);
  useEffect(
    () => () => {
      geo.street.dispose();
      geo.foot.dispose();
      geo.well?.dispose();
      geo.inlay.dispose();
    },
    [geo]
  );

  const mats = useMemo(
    () => ({
      // Vellum rather than card: costs just below glimmer through where the street hides them.
      street: new MeshStandardMaterial({ roughness: 0.9, metalness: 0, transparent: true, opacity: 0.9, envMapIntensity: 0.7 }),
      foot: new MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.4 }),
      inlay: new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }),
      // Clear, untinted glass (no violet body, no refraction of the violet night): the amber hanging in it keeps its hue.
      well: new MeshPhysicalMaterial({ transparent: true, depthWrite: false, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.6 }),
    }),
    []
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  useEffect(() => {
    mats.street.color.set(p.night ? mixHex(p.surface, p.violet, 0.12) : mixHex(p.paper, '#EFE6D6', 0.3));
    mats.foot.color.set(p.night ? mixHex(p.surface, p.ink, 0.14) : mixHex(p.porcelain, p.ink, 0.05));
    mats.inlay.color.set(p.night ? p.violetLight : p.violet);
    mats.inlay.opacity = p.night ? 0.8 : 0.6;
    mats.well.color.set('#FFFFFF');
    mats.well.opacity = p.night ? 0.07 : 0.1;
  }, [mats, p]);

  return (
    <>
      <ContactBlob width={sx * 1.5} depth={sz * 2.6} position={[0, layout.bottom - 0.004, 0.05]} strength={1.1} />
      <mesh geometry={geo.foot} material={mats.foot} />
      {geo.well && <mesh geometry={geo.well} material={mats.well} renderOrder={2} />}
      <mesh geometry={geo.street} material={mats.street} renderOrder={3} />
      <mesh geometry={geo.inlay} material={mats.inlay} renderOrder={4} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Number plaques on the foot's front edge, drawn into a small canvas each
// (no font files, no workers: the page's own mono face, read from CSS).

function drawTag(canvas: HTMLCanvasElement, label: string, p: ScenePalette, font: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  const r = h * 0.28;
  ctx.beginPath();
  ctx.moveTo(r, 1);
  ctx.arcTo(w - 1, 1, w - 1, h - 1, r);
  ctx.arcTo(w - 1, h - 1, 1, h - 1, r);
  ctx.arcTo(1, h - 1, 1, 1, r);
  ctx.arcTo(1, 1, w - 1, 1, r);
  ctx.closePath();
  ctx.fillStyle = p.night ? mixHex(p.surface, p.violet, 0.2) : mixHex(p.paper, '#FFFFFF', 0.5);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = p.night ? mixHex(p.violetLight, p.surface, 0.5) : mixHex(p.ink, p.paper, 0.75);
  ctx.stroke();
  ctx.fillStyle = p.night ? p.violetLight : p.ink;
  ctx.font = `600 ${Math.round(h * 0.6)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, w / 2, h / 2 + 1);
}

function Tags({ layout }: { layout: SkylineLayout }) {
  const p = useScenePalette();
  const { element } = useViewState();
  const group = useRef<Group>(null);
  const footY = layout.bottom + W.foot / 2;

  // One plaque per lot, numbered 1 … n whatever the horizon: rebuilt only when the count changes.
  const count = layout.lots.length;
  const textures = useMemo(
    () =>
      Array.from({ length: count }, () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 64;
        const t = new CanvasTexture(canvas);
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      }),
    [count]
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);
  const mats = useMemo(() => textures.map((map) => new MeshBasicMaterial({ map, transparent: true, toneMapped: false })), [textures]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const plate = useMemo(() => new BoxGeometry(W.tag.width, W.tag.height, 0.001), []);
  useEffect(() => () => plate.dispose(), [plate]);

  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let live = true;
    const draw = () => {
      if (!live) return;
      const css = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();
      const font = css ? `${css}, ui-monospace, monospace` : 'ui-monospace, monospace';
      textures.forEach((t, i) => {
        drawTag(t.image as HTMLCanvasElement, String(i + 1).padStart(2, '0'), p, font);
        t.needsUpdate = true;
      });
      invalidate();
    };
    draw();
    // Again once the page's fonts are in (a canvas doesn't redraw by itself).
    void document.fonts?.ready.then(draw);
    return () => {
      live = false;
    };
  }, [textures, p, invalidate]);

  useFrame(() => {
    if (group.current) group.current.visible = (element?.clientWidth ?? 0) >= TAG_MIN_WIDTH;
  });

  return (
    <group ref={group}>
      {layout.lots.map((lot, i) => (
        <mesh key={lot.id} geometry={plate} material={mats[i]} position={[lot.x, footY, layout.halfZ + 0.0165]} renderOrder={5} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// The towers: a rising and a hanging glass box per lot (one shows, by the
// sign), a flat tile for $0, and an empty lot's outline.

interface TowersProps {
  layout: SkylineLayout;
  focus: string | null;
  animated: boolean;
  onFocus?: (id: string | null) => void;
}

function Towers({ layout, focus, animated, onFocus }: TowersProps) {
  const p = useScenePalette();
  const tones = useMemo(() => towerTones(p), [p]);
  const { element } = useViewState();
  const hovered = useRef<string | null>(null);

  const geo = useMemo(() => {
    const up = new BoxGeometry(W.width, 1, W.width);
    up.translate(0, 0.5, 0);
    const down = new BoxGeometry(W.width, 1, W.width);
    down.translate(0, -0.5, 0);
    const flat = new RoundedBoxGeometry(W.width, W.flat, W.width, 2, 0.005);
    flat.translate(0, W.flat / 2, 0);
    const edge = new BoxGeometry(1, 0.002, 1);
    return { up, down, flat, edge };
  }, []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Lots are keyed by id, so a tower keeps its glass (and its animated height) as the horizon changes.
  const ids = layout.lots.map((l) => l.id).join('|');
  const floor = layout.floorDollars * layout.unitsPerDollar;
  const mats = useMemo(
    () => new Map(layout.lots.map((l) => [l.id, skylineGlass(floor || 1, W.street)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, floor]
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  const flatMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.45, metalness: 0, transparent: true, emissive: '#000000' }), []);
  const lotMat = useMemo(() => new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }), []);
  useEffect(
    () => () => {
      flatMat.dispose();
      lotMat.dispose();
    },
    [flatMat, lotMat]
  );
  useEffect(() => {
    // Almost all its own light (the studio's violet rim and lilac key would turn a lit porcelain lavender).
    flatMat.color.copy(tones.flat).multiplyScalar(0.15);
    flatMat.emissive.copy(tones.flat);
    flatMat.emissiveIntensity = p.night ? 0.9 : 0.4;
    flatMat.envMapIntensity = 0.12;
    flatMat.opacity = 0.92;
    lotMat.color.set(p.night ? p.violetLight : p.violet);
    lotMat.opacity = p.night ? 0.55 : 0.45;
  }, [flatMat, lotMat, tones, p]);

  const up = useRef(new Map<string, Mesh>());
  const down = useRef(new Map<string, Mesh>());
  // Signed animated height per lot (+ rises, − hangs) and its emphasis.
  const heights = useRef(new Map<string, number>());
  const lit = useRef(new Map<string, number>());

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    for (const lot of layout.lots) {
      const goal = lot.dir === 1 ? lot.height : lot.dir === -1 ? -lot.height : 0;
      // A lot takes its height at once when it first appears (the poster already showed it); later it grows or sinks to the new horizon.
      const prev = heights.current.get(lot.id) ?? goal;
      const h = animated ? prev + (goal - prev) * (1 - Math.exp(-dt * 4.2)) : goal;
      heights.current.set(lot.id, Math.abs(h - goal) < 1e-4 ? goal : h);

      const emphasisGoal = focus ? (focus === lot.id ? 1.3 : 0.5) : 1;
      const prevE = lit.current.get(lot.id) ?? emphasisGoal;
      const e = animated ? prevE + (emphasisGoal - prevE) * (1 - Math.exp(-dt * 7)) : emphasisGoal;
      lit.current.set(lot.id, e);

      const rising = up.current.get(lot.id);
      const hanging = down.current.get(lot.id);
      const m = mats.get(lot.id);
      const shown = Math.abs(h);
      // The idle box shrinks to nothing too: invisible meshes still take the pointer.
      if (rising) {
        rising.visible = h > 1e-4;
        rising.scale.y = rising.visible ? shown : 1e-4;
      }
      if (hanging) {
        hanging.visible = h < -1e-4;
        hanging.scale.y = hanging.visible ? shown : 1e-4;
      }
      if (m) paintTower(m, tones, p.night, h >= 0, e);
    }
  });

  // The pointer can leave the box straight from a tower (the stage then stops raycasting this view).
  useEffect(() => {
    if (!element) return;
    const leave = () => {
      if (hovered.current === null) return;
      hovered.current = null;
      element.style.cursor = '';
      onFocus?.(null);
    };
    element.addEventListener('pointerleave', leave);
    return () => element.removeEventListener('pointerleave', leave);
  }, [element, onFocus]);

  const over = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (hovered.current === id) return;
    hovered.current = id;
    if (element) element.style.cursor = 'pointer';
    onFocus?.(id);
  };
  const out = (id: string) => () => {
    if (hovered.current !== id) return;
    hovered.current = null;
    if (element) element.style.cursor = '';
    onFocus?.(null);
  };

  return (
    <>
      {layout.lots.map((lot) => {
        const m = mats.get(lot.id);
        return (
          <group key={lot.id} position={[lot.x, 0, lot.z]}>
            {m && (
              <>
                <mesh
                  ref={(el) => {
                    if (el) up.current.set(lot.id, el);
                    else up.current.delete(lot.id);
                  }}
                  geometry={geo.up}
                  material={m}
                  visible={false}
                  renderOrder={6}
                  onPointerOver={over(lot.id)}
                  onPointerOut={out(lot.id)}
                />
                <mesh
                  ref={(el) => {
                    if (el) down.current.set(lot.id, el);
                    else down.current.delete(lot.id);
                  }}
                  geometry={geo.down}
                  material={m}
                  position={[0, -W.street, 0]}
                  visible={false}
                  renderOrder={1}
                  onPointerOver={over(lot.id)}
                  onPointerOut={out(lot.id)}
                />
              </>
            )}
            {lot.dir === 0 && (
              <mesh geometry={geo.flat} material={flatMat} renderOrder={5} onPointerOver={over(lot.id)} onPointerOut={out(lot.id)} />
            )}
            {lot.dir === null &&
              // An empty lot: its footprint as a violet hairline on the street.
              (
                [
                  [0, W.width / 2, W.width, 0.006],
                  [0, -W.width / 2, W.width, 0.006],
                  [W.width / 2, 0, 0.006, W.width],
                  [-W.width / 2, 0, 0.006, W.width],
                ] as const
              ).map(([x, z, sx, sz], j) => (
                <mesh key={j} geometry={geo.edge} material={lotMat} position={[x, 0.0016, z]} scale={[sx, 1, sz]} renderOrder={4} />
              ))}
          </group>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

export default function Skyline({ towers, horizon, reach, focus = null, onFocus }: SkylineProps) {
  const animated = useAnimated(30);
  const reduced = usePrefersReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  // Keyed on content, so an equal list rebuilt by the page doesn't rebuild the model.
  const key = towers.map((t) => `${t.id}:${t.value}`).join(',');
  const up = reach?.up ?? null;
  const down = reach?.down ?? null;
  const layout = useMemo(
    () => skylineLayout(towers, up === null || down === null ? reachOf(towers) : { up, down }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, up, down]
  );
  // Without the animation clock (reduced motion, or off screen) a change still needs a frame.
  useEffect(() => invalidate(), [layout, focus, horizon, reduced, invalidate]);

  return (
    <>
      <SkylineRig layout={layout} animated={animated} />
      <StudioLights />
      <SkylinePlinth layout={layout} />
      <Towers layout={layout} focus={focus} animated={animated} onFocus={onFocus} />
      {layout.tags && <Tags layout={layout} />}
      <PostFX />
    </>
  );
}
