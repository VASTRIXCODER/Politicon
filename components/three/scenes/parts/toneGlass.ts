import { Color, MeshPhysicalMaterial } from 'three';
import { mixHex, type ScenePalette } from '@/lib/three/palette';
import type { TransmissionTone } from '@/lib/transmission';

/*
 * The Transmission's meaning glass: ledger teal for money that saves the
 * user, ember amber for money it costs them, porcelain for no change. Each
 * is a clear-coated glass with a fresnel rim in its own colour, so it reads
 * as lit glass from every angle. One shader program for every tone and scene.
 *
 * The hue is the meaning, so it is held: the body is the tone's own colour
 * (never mixed toward porcelain, white or violet), lit mostly from within in
 * that same colour, nearly opaque so the violet night behind it doesn't
 * tint it, and with little of the violet studio in its reflections. Teal
 * and amber here match the legends and the posters beside them. A size is
 * shown by height, never by fading the colour.
 */

const RIM_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
`;

const RIM_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, 2.4);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.3, 0.0, 1.0);
#include <opaque_fragment>
`;

interface RimUniforms {
  uRimColor: { value: Color };
  uRimStrength: { value: number };
}

export function toneGlass(): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    transparent: true,
    metalness: 0,
    roughness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.08,
    // The studio is violet: kept faint in the glass, so it lends a sheen, not a hue.
    envMapIntensity: 0.35,
    emissive: new Color(),
  });
  const uniforms: RimUniforms = { uRimColor: { value: new Color() }, uRimStrength: { value: 1 } };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${RIM_PARS}`)
      .replace('#include <opaque_fragment>', RIM_LIGHT);
  };
  m.customProgramCacheKey = () => 'politicon-transmission-glass';
  return m;
}

/**
 * "No change": porcelain, a true warm neutral (dimmed by night, never
 * violet), so a $0 tile reads apart from the violet ground it stands on.
 */
export function neutralHex(p: ScenePalette): string {
  return p.night ? mixHex(p.porcelain, '#000000', 0.32) : mixHex(p.porcelain, '#000000', 0.06);
}

/** The base colour of a tone in this palette (teal, amber, or porcelain for none). */
export function toneHex(p: ScenePalette, tone: TransmissionTone): string {
  if (tone === 'gain') return p.gain;
  if (tone === 'loss') return p.loss;
  return neutralHex(p);
}

export interface ToneLook {
  /** 0 … 1: light inside the glass (brighter, never another hue). Default 0.3. */
  glow?: number;
  /** Base opacity before the rim. Default by theme. */
  opacity?: number;
}

/** Colours a toneGlass for a tone; neutral is a near-opaque porcelain. */
export function paintTone(m: MeshPhysicalMaterial, p: ScenePalette, tone: TransmissionTone, look: ToneLook = {}) {
  const glow = Math.min(1, Math.max(0, look.glow ?? 0.3));
  const rim = m.userData.rim as RimUniforms;
  const hex = toneHex(p, tone);
  m.color.set(hex);
  m.emissive.set(hex);
  if (tone === 'neutral') {
    // Almost all its own light: the studio's violet rim and lilac key would turn a lit porcelain lavender.
    m.color.set(mixHex(hex, '#000000', 0.85));
    m.emissiveIntensity = p.night ? 0.9 : 0.4;
    m.envMapIntensity = 0.12;
    // Matte, so its top doesn't mirror the studio's lilac softbox either.
    m.roughness = 0.6;
    m.clearcoat = 0.1;
    m.specularIntensity = 0.25;
    m.opacity = look.opacity ?? 0.96;
    // Its rim is its own porcelain, lighter: no violet edge on "no change".
    rim.uRimColor.value.set(mixHex(hex, '#FFFFFF', 0.4));
    rim.uRimStrength.value = 0.35;
    return;
  }
  m.envMapIntensity = 0.35;
  m.roughness = 0.2;
  m.clearcoat = 0.6;
  m.specularIntensity = 1;
  // Lit from within in its own colour, so the violet key and fill lights don't shift the hue.
  m.emissiveIntensity = (p.night ? 0.5 : 0.28) + glow * (p.night ? 0.35 : 0.2);
  m.opacity = look.opacity ?? (p.night ? 0.88 : 0.9);
  // A lighter rim of the same hue (a mix toward white keeps the hue).
  rim.uRimColor.value.set(mixHex(hex, '#FFFFFF', 0.35));
  rim.uRimStrength.value = 0.9;
}
