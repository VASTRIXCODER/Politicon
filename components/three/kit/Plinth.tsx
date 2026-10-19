'use client';

import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, LatheGeometry, MeshStandardMaterial, ShaderMaterial, Vector2, type BufferGeometry } from 'three';
import { mixHex } from '@/lib/three/palette';
import { useScenePalette } from '@/components/three/kit/hooks';

/*
 * The paper plinth every Politicon diorama stands on (the Capitol in the
 * hero and the landing film, the household): a lathe-turned drum with a
 * softly rounded top edge and a fine inset line, in matte paper with a baked
 * occlusion gradient, over a soft blob shadow. Its top is y = 0, so whatever
 * stands on it is placed at y = 0 as on the ground.
 *
 * Also exported for other kit pieces: `occlude` (the vertex-colour occlusion
 * the Capitol uses too) and <ContactBlob> (a soft shadow without shadow maps).
 */

export interface PlinthProps {
  radius?: number;
  height?: number;
  position?: [number, number, number];
  /** Shadow strength under the plinth, 0..1 of the palette's. */
  shadow?: number;
  /**
   * The shadow's footprint across, in plinth radii (default 3.1: a wide,
   * soft pool for scenes with room around the plinth). A view framed tight
   * on the plinth wants a smaller one, or its box's edge cuts the pool.
   */
  shadowSpread?: number;
  /**
   * The drum's colour. Default: the palette's paper by night, its surface
   * by day. A view whose subject is data (the impact page's night vitrines)
   * passes a darker night tone, so the plinth stays quieter than the data.
   */
  color?: string;
}

/** Darkens a geometry toward its base (y0 → y1) through vertex colours: cheap ambient occlusion. */
export function occlude<T extends BufferGeometry>(g: T, y0: number, y1: number, dark = 0.28): T {
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0)));
    const f = 1 - dark * (1 - t * t * (3 - 2 * t));
    colors.set([f, f, f], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

const BLOB_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BLOB_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 d = (vUv - 0.5) * 2.0;
  float a = exp(-dot(d, d) * 3.2) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}
`;

export interface ContactBlobProps {
  /** Footprint (the blob fades out well inside it). */
  width: number;
  depth: number;
  position?: [number, number, number];
  rotationY?: number;
  /** 0..1 of the palette's shadow strength. */
  strength?: number;
}

/** A soft elliptical shadow on the ground (y of `position`), drawn before what stands on it. */
export function ContactBlob({ width, depth, position = [0, 0.001, 0], rotationY = 0, strength = 1 }: ContactBlobProps) {
  const palette = useScenePalette();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uOpacity: { value: 0.2 } },
        vertexShader: BLOB_VERTEX,
        fragmentShader: BLOB_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uColor.value.set(palette.shadow);
    material.uniforms.uOpacity.value = palette.light.shadow * 2.2 * strength;
  }, [material, palette, strength]);

  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, rotationY]} material={material} renderOrder={-1}>
      <planeGeometry args={[width, depth]} />
    </mesh>
  );
}

/**
 * Profile of the drum, from the centre of its foot out and up to the centre
 * of its top (a lathe faces outward when its profile climbs): a small chamfer
 * at the foot, a straight side, a rounded top edge.
 */
function plinthProfile(radius: number, height: number): Vector2[] {
  const top = Math.min(0.045, height * 0.25);
  const foot = Math.min(0.02, height * 0.12);
  const pts: Vector2[] = [new Vector2(0, -height), new Vector2(radius - foot, -height), new Vector2(radius, -height + foot)];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    pts.push(new Vector2(radius - top + Math.cos(a) * top, -top + Math.sin(a) * top));
  }
  pts.push(new Vector2(0, 0));
  return pts;
}

export default function Plinth({ radius = 1.2, height = 0.2, position = [0, 0, 0], shadow = 1, shadowSpread = 3.1, color }: PlinthProps) {
  const palette = useScenePalette();

  const geo = useMemo(() => {
    const drum = occlude(new LatheGeometry(plinthProfile(radius, height), 128), -height, 0, 0.3);
    return { drum };
  }, [radius, height]);
  useEffect(() => () => geo.drum.dispose(), [geo]);

  const paper = useMemo(() => new MeshStandardMaterial({ roughness: 0.94, metalness: 0, vertexColors: true }), []);
  useEffect(() => () => paper.dispose(), [paper]);
  useEffect(() => {
    paper.color.set(color ?? (palette.night ? palette.paper : palette.surface));
  }, [paper, palette, color]);

  // A hairline of violet set into the top, just inside the edge.
  const inlay = mixHex(palette.night ? palette.paper : palette.porcelain, palette.violet, palette.night ? 0.55 : 0.32);

  return (
    <group position={position}>
      <ContactBlob width={radius * shadowSpread} depth={radius * shadowSpread} position={[0, -height - 0.004, 0]} strength={shadow} />
      <mesh geometry={geo.drum} material={paper} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0015, 0]}>
        <ringGeometry args={[radius - 0.11, radius - 0.1, 160]} />
        <meshStandardMaterial color={inlay} roughness={0.6} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}
