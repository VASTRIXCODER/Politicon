import { Color, MeshPhysicalMaterial } from 'three';
import { mixHex, type ScenePalette } from '@/lib/three/palette';

/*
 * The Skyline's tower glass: a clear-coated physical glass in the
 * direction's own colour (ledger teal for gains, ember amber for costs),
 * with a fresnel rim of the same hue so it reads as lit glass from every
 * angle, and a fine floor line etched into it every `floor` of world height
 * (one floor = a round number of dollars, lib/skyline floorDollars): the
 * scale, drawn into the glass, measured from the street both ways. One
 * shader program for every tower.
 *
 * The hue is the meaning, so it is held: never mixed toward white or the
 * violet night, lit mostly from within in its own colour, nearly opaque, and
 * with little of the violet studio in its reflections, so a tower matches
 * the legend's swatch beside it. A tower dims (when another is lit) by
 * light and opacity, never by changing colour.
 */

const VERTEX_PARS = /* glsl */ `
varying float vStreetY;
`;

const VERTEX = /* glsl */ `
#include <project_vertex>
vStreetY = (modelMatrix * vec4(transformed, 1.0)).y;
`;

const FRAGMENT_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uFloor;
uniform float uFloorLine;
uniform float uStreet;
varying float vStreetY;
`;

const FRAGMENT_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, 2.3);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.32, 0.0, 1.0);
// Floors count from the street: up from its top, down from its underside.
float fromStreet = vStreetY >= 0.0 ? vStreetY : -vStreetY - uStreet;
float floorY = max(fromStreet, 0.0) / uFloor;
float floorD = abs(fract(floorY + 0.5) - 0.5);
float floorW = fwidth(floorY);
float floorLine = (1.0 - smoothstep(uFloorLine, uFloorLine + floorW * 1.5, floorD)) * step(0.5, floorY);
outgoingLight = mix(outgoingLight, uRimColor, floorLine * 0.38);
diffuseColor.a = max(diffuseColor.a, floorLine * 0.6);
#include <opaque_fragment>
`;

export interface SkylineGlassUniforms {
  uRimColor: { value: Color };
  uRimStrength: { value: number };
  uFloor: { value: number };
  uFloorLine: { value: number };
  uStreet: { value: number };
}

/** `floor`: one floor's world height; `street`: the street's thickness (costs count down from its underside). */
export function skylineGlass(floor: number, street: number): MeshPhysicalMaterial {
  const m = new MeshPhysicalMaterial({
    transparent: true,
    metalness: 0,
    roughness: 0.07,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
    // The studio is violet: a faint sheen, not a tint.
    envMapIntensity: 0.4,
    emissive: new Color(),
  });
  const uniforms: SkylineGlassUniforms = {
    uRimColor: { value: new Color() },
    uRimStrength: { value: 1 },
    uFloor: { value: Math.max(1e-4, floor) },
    // Half the line's width, as a share of a floor (about 3.5 thousandths of a unit).
    uFloorLine: { value: Math.min(0.08, 0.0035 / Math.max(1e-4, floor)) },
    uStreet: { value: street },
  };
  m.userData.rim = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <project_vertex>', VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <opaque_fragment>', FRAGMENT_LIGHT);
  };
  m.customProgramCacheKey = () => 'politicon-skyline-tower';
  return m;
}

export interface TowerTones {
  gain: Color;
  loss: Color;
  gainRim: Color;
  lossRim: Color;
  /** A $0 tile: porcelain, a true neutral (dimmed by night), never violet. */
  flat: Color;
}

export function towerTones(p: ScenePalette): TowerTones {
  return {
    gain: new Color(p.gain),
    loss: new Color(p.loss),
    // A lighter rim of the same hue (a mix toward white keeps the hue).
    gainRim: new Color(mixHex(p.gain, '#FFFFFF', 0.4)),
    lossRim: new Color(mixHex(p.loss, '#FFFFFF', 0.4)),
    flat: new Color(p.night ? mixHex(p.porcelain, '#000000', 0.32) : mixHex(p.porcelain, '#000000', 0.06)),
  };
}

/**
 * Colours tower glass for its direction and emphasis (0 dimmed … 1 normal …
 * 1.3 lit by the page's focus).
 */
export function paintTower(m: MeshPhysicalMaterial, tones: TowerTones, night: boolean, gain: boolean, emphasis: number) {
  const full = Math.min(1, emphasis);
  const lift = Math.max(0, emphasis - 1);
  const tone = gain ? tones.gain : tones.loss;
  m.color.copy(tone);
  m.emissive.copy(tone);
  // Lit from within in its own colour (so the violet lights don't turn the hue); the focused tower brightens.
  m.emissiveIntensity = (night ? 0.5 : 0.26) * (0.2 + 0.8 * full) + lift * (night ? 0.5 : 0.3);
  // Nearly opaque, so the night behind doesn't tint it; a dimmed tower is darker (less light from within), the same hue.
  m.opacity = Math.min(0.97, 0.7 + 0.18 * full + lift * 0.3);
  const rim = m.userData.rim as SkylineGlassUniforms;
  rim.uRimColor.value.copy(gain ? tones.gainRim : tones.lossRim);
  rim.uRimStrength.value = 0.85 * (0.4 + 0.6 * full) + lift * 1.1;
}
