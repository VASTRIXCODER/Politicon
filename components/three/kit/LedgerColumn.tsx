'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  MeshPhysicalMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  type Group,
  type Mesh,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixHex } from '@/lib/three/palette';
import { ledgerLayout, slabShown, type LedgerOptions } from '@/components/three/kit/dioramaLayout';
import { ContactBlob, occlude } from '@/components/three/kit/Plinth';
import { useScenePalette } from '@/components/three/kit/hooks';
import { useWarmup } from '@/components/three/kit/warmup';

/*
 * A ledger as a column of glass slabs on a porcelain pedestal: gains in
 * ledger teal stacked up from a baseline (the zero line, a porcelain plate
 * with a faint violet tint), costs in ember amber hanging down from it, each
 * slab's height linear in its dollars, and a soft round halo of violet light
 * around the column marking the net. The halo has no hard core line and no
 * corners, so from no angle does it read as a wire box. The numbers
 * themselves are never 3D: the page says them in text.
 *
 *   fill  0..1, how far the slabs have grown out from the baseline (both
 *         ways, as a share of the taller stack), so they can fill as light
 *         arrives
 *   mark  0..1, the net ring appearing
 *   glow  0..1, the light inside the glass (an evening scene)
 *
 * Each can be a number or a function read every frame (no re-render).
 * Standing on y = 0; about `width` square and (gains + costs) × unitsPerDollar tall.
 */

type Driven = number | (() => number);

export interface LedgerColumnProps extends LedgerOptions {
  /** Signed dollars: positive amounts are gains, negative ones costs. Pass a stable array (the slabs are rebuilt when it changes). */
  amounts: readonly number[];
  /** Slab width (square). */
  width?: number;
  position?: [number, number, number];
  fill?: Driven;
  mark?: Driven;
  glow?: Driven;
}

const read = (v: Driven) => Math.min(1, Math.max(0, typeof v === 'function' ? v() : v));

const RIM_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
`;

// A fresnel rim of the slab's own colour, so it reads as lit glass at every angle.
const RIM_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, 2.4);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.3, 0.0, 1.0);
#include <opaque_fragment>
`;

// The net's halo: a round, soft band of light drawn flat around the column
// (a circle clear of the slabs' corners), brightest along its radius and
// fading out both ways, with no core line. Premultiplied, so it reads as
// violet haze on paper by day (uAdd < 1) and adds up as light by night
// (uAdd 1).
const HALO_VERTEX = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uRadius;
uniform float uWidth;
uniform float uStrength;
uniform float uAdd;
varying vec2 vP;
void main() {
  float d = (length(vP) - uRadius) / uWidth;
  float a = (exp(-d * d * 2.2) * 0.72 + exp(-abs(d) * 1.1) * 0.28) * uStrength;
  if (a < 0.003) discard;
  vec4 o = linearToOutputTexel(vec4(uColor, 1.0));
  gl_FragColor = vec4(o.rgb * a, a * (1.0 - uAdd));
}
`;

function slabGlass(key: string) {
  const m = new MeshPhysicalMaterial({
    transparent: true,
    metalness: 0,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.3,
    emissive: new Color(),
  });
  const uniforms = { uRimColor: { value: new Color() }, uRimStrength: { value: 1.4 } };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIM_PARS}`)
      .replace('#include <opaque_fragment>', RIM_LIGHT);
  };
  m.customProgramCacheKey = () => `politicon-ledger-${key}`;
  return m;
}

export default function LedgerColumn({
  amounts,
  unitsPerDollar,
  pedestal,
  gap,
  width = 0.26,
  position = [0, 0, 0],
  fill = 1,
  mark = 1,
  glow = 0,
}: LedgerColumnProps) {
  const palette = useScenePalette();
  const slabRefs = useRef<(Mesh | null)[]>([]);
  const ring = useRef<Group>(null);
  const warmup = useWarmup();

  const layout = useMemo(() => ledgerLayout(amounts, { unitsPerDollar, pedestal, gap }), [amounts, unitsPerDollar, pedestal, gap]);

  const geo = useMemo(() => {
    const radius = Math.min(0.016, width * 0.08);
    // Each slab's origin is the face nearest the baseline, so scaling y grows it outward.
    const slabs = layout.slabs.map((s) => {
      const h = s.outer - s.inner;
      const g = new RoundedBoxGeometry(width, h, width, 2, Math.min(radius, h * 0.45));
      g.translate(0, s.gain ? h / 2 : -h / 2, 0);
      return g;
    });
    const base = Math.max(0.02, layout.pedestal);
    const foot = occlude(new CylinderGeometry(width * 0.78, width * 0.84, base, 48), -base / 2, base / 2, 0.25);
    foot.translate(0, base / 2, 0);
    const plate = new RoundedBoxGeometry(width + 0.07, 0.016, width + 0.07, 2, 0.006);
    // The net halo: a circle clear of the slabs' corners (half their diagonal), on a plane wide enough for its falloff.
    const haloRadius = width * 0.71 + 0.05;
    const haloWidth = 0.045;
    const haloHalf = haloRadius + haloWidth * 4;
    const halo = new PlaneGeometry(haloHalf * 2, haloHalf * 2);
    halo.rotateX(-Math.PI / 2);
    // A slim spine from the pedestal to the baseline, so the zero line never floats.
    const spineHeight = Math.max(0.001, layout.baseline - base);
    const spine = new CylinderGeometry(0.014, 0.014, spineHeight, 16);
    spine.translate(0, base + spineHeight / 2, 0);
    return { slabs, foot, plate, spine, halo, haloRadius, haloWidth };
  }, [layout, width]);
  useEffect(
    () => () => {
      geo.slabs.forEach((g) => g.dispose());
      geo.foot.dispose();
      geo.plate.dispose();
      geo.spine.dispose();
      geo.halo.dispose();
    },
    [geo]
  );

  const mats = useMemo(
    () => ({
      gain: slabGlass('gain'),
      loss: slabGlass('loss'),
      porcelain: new MeshPhysicalMaterial({ roughness: 0.7, metalness: 0, vertexColors: true }),
      plate: new MeshPhysicalMaterial({ roughness: 0.5, metalness: 0, clearcoat: 0.6, emissive: new Color() }),
      halo: new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color() },
          uRadius: { value: 0.2 },
          uWidth: { value: 0.04 },
          uStrength: { value: 0 },
          uAdd: { value: 0 },
        },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
      }),
    }),
    []
  );
  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats]
  );

  const tones = useMemo(
    () => ({
      gain: new Color(palette.gain),
      loss: new Color(palette.loss),
    }),
    [palette]
  );

  useEffect(() => {
    const base = palette.night ? palette.paper : palette.porcelain;
    mats.gain.color.set(mixHex(palette.gain, '#FFFFFF', palette.night ? 0.12 : 0.18));
    mats.loss.color.set(mixHex(palette.loss, '#FFFFFF', palette.night ? 0.12 : 0.18));
    mats.gain.emissive.copy(tones.gain);
    mats.loss.emissive.copy(tones.loss);
    (mats.gain.userData.rim as { uRimColor: { value: Color } }).uRimColor.value.set(mixHex(palette.gain, '#FFFFFF', 0.45));
    (mats.loss.userData.rim as { uRimColor: { value: Color } }).uRimColor.value.set(mixHex(palette.loss, '#FFFFFF', 0.45));
    mats.porcelain.color.set(base);
    // The zero plate: porcelain with a breath of violet (a lit slab, never a line of light).
    mats.plate.color.set(mixHex(base, palette.violet, palette.night ? 0.1 : 0.08));
    mats.plate.emissive.set(palette.night ? palette.violet : '#000000');
    mats.plate.emissiveIntensity = palette.night ? 0.12 : 0;
    const halo = mats.halo.uniforms;
    halo.uColor.value.set(palette.night ? palette.violetLight : palette.glow);
    halo.uAdd.value = palette.night ? 1 : 0.35;
    halo.uRadius.value = geo.haloRadius;
    halo.uWidth.value = geo.haloWidth;
  }, [mats, palette, tones, geo]);

  useFrame(() => {
    const front = read(fill);
    const g = read(glow);
    // Hidden slabs and ring still draw (a sliver, zero opacity) until the view is on screen, so they compile early.
    const warm = warmup();
    layout.slabs.forEach((s, i) => {
      const mesh = slabRefs.current[i];
      if (!mesh) return;
      const shown = slabShown(s, front, layout.extent);
      mesh.visible = shown > 0.002 || warm;
      mesh.scale.y = Math.max(0.002, shown);
    });
    for (const m of [mats.gain, mats.loss]) {
      m.opacity = 0.62 + g * 0.22;
      m.emissiveIntensity = 0.2 + g * 0.55;
    }
    const k = read(mark);
    if (ring.current) {
      ring.current.visible = k > 0.002 || warm;
      // It closes in on the column as it appears.
      const s = 1.35 - 0.35 * k * k * (3 - 2 * k);
      ring.current.scale.set(s, 1, s);
    }
    mats.halo.uniforms.uStrength.value = k * (palette.night ? 0.6 + g * 0.35 : 0.9);
  });

  return (
    <group position={position}>
      <ContactBlob width={width * 2.6} depth={width * 2.6} strength={1.2} />
      <mesh geometry={geo.foot} material={mats.porcelain} />
      <mesh geometry={geo.spine} material={mats.plate} />
      {layout.slabs.map((s, i) => (
        <mesh
          key={i}
          ref={(m) => {
            slabRefs.current[i] = m;
          }}
          geometry={geo.slabs[i]}
          material={s.gain ? mats.gain : mats.loss}
          position={[0, layout.baseline + (s.gain ? s.inner : -s.inner), 0]}
        />
      ))}
      {/* The baseline: zero, a porcelain plate. */}
      <mesh geometry={geo.plate} material={mats.plate} position={[0, layout.baseline, 0]} />
      {/* The net: a soft round halo of violet light around the column, closing in as it appears. */}
      <group ref={ring} position={[0, layout.netY, 0]}>
        <mesh geometry={geo.halo} material={mats.halo} renderOrder={7} />
      </group>
    </group>
  );
}
