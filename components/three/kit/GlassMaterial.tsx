'use client';

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import { Color, FrontSide, MeshPhysicalMaterial, type Side } from 'three';
import { useKitTier, useScenePalette } from '@/components/three/kit/hooks';

/*
 * Politicon glass, as a material for the mesh it's placed in:
 *
 *   <mesh geometry={g}><GlassMaterial /></mesh>
 *
 * Tier 2 gets real refraction (drei MeshTransmissionMaterial, a modest 6
 * samples into a 512px buffer). Tier 1 gets a physical material that fakes it:
 * see-through, clear-coated, with a fresnel rim of violet light added in the
 * shader, and no extra render pass. The two are calibrated against each
 * other (/lab shows them side by side): a pale, clear body that lets the
 * page through, with the violet in the thick parts and the rim.
 *
 * Refraction behind a view shows the page's canvas colour (the ambient field
 * itself isn't in a view's scene), which matches what the eye expects.
 */

export interface GlassMaterialProps {
  /** Body colour. Default: the palette's violet glass. */
  tint?: string;
  /** Rim light colour. Default: the palette's rim violet. */
  rim?: string;
  /** How thick the glass reads (refraction strength). */
  thickness?: number;
  roughness?: number;
  ior?: number;
  /** Tier 1 only: how opaque the stand-in glass is at its centre. */
  opacity?: number;
  side?: Side;
}

const RIM_PARS = /* glsl */ `
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimStrength;
`;

// Added just before the fragment's final colour is written.
const RIM_LIGHT = /* glsl */ `
float rimFacing = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
float rimLight = pow(1.0 - rimFacing, uRimPower);
outgoingLight += uRimColor * rimLight * uRimStrength;
diffuseColor.a = clamp(diffuseColor.a + rimLight * 0.4, 0.0, 1.0);
#include <opaque_fragment>
`;

function RimGlass({ tint, rim, roughness, ior, opacity, side }: Required<Omit<GlassMaterialProps, 'thickness'>>) {
  const invalidate = useThree((s) => s.invalidate);
  const material = useMemo(() => {
    const m = new MeshPhysicalMaterial({
      transparent: true,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.25,
    });
    const uniforms = {
      uRimColor: { value: new Color() },
      uRimPower: { value: 2.6 },
      uRimStrength: { value: 1 },
    };
    m.userData.rim = uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${RIM_PARS}`)
        .replace('#include <opaque_fragment>', RIM_LIGHT);
    };
    m.customProgramCacheKey = () => 'politicon-rim-glass';
    return m;
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.color.set(tint);
    material.roughness = roughness;
    material.ior = ior;
    material.opacity = opacity;
    // Double-sidedness is compiled into the shader.
    if (material.side !== side) {
      material.side = side;
      material.needsUpdate = true;
    }
    (material.userData.rim as { uRimColor: { value: Color } }).uRimColor.value.set(rim);
    invalidate();
  }, [material, tint, rim, roughness, ior, opacity, side, invalidate]);

  return <primitive object={material} attach="material" />;
}

export default function GlassMaterial({
  tint,
  rim,
  thickness = 0.35,
  roughness = 0.12,
  ior = 1.4,
  opacity,
  side = FrontSide,
}: GlassMaterialProps) {
  const tier = useKitTier();
  const palette = useScenePalette();
  const body = tint ?? palette.glassTint;
  const background = useMemo(() => new Color(palette.canvas), [palette.canvas]);

  if (tier === 2) {
    return (
      <MeshTransmissionMaterial
        samples={6}
        resolution={512}
        // By night the room behind is dark: keep some of the lilac body, so
        // thick parts read as lit glass rather than black.
        transmission={palette.night ? 0.82 : 1}
        thickness={thickness}
        // Smooth by night: rough transmission samples sparkle into speckle.
        roughness={palette.night ? Math.min(roughness, 0.06) : roughness}
        ior={ior}
        // Kept tiny: more splits the light into rainbow speckle.
        chromaticAberration={0.01}
        anisotropicBlur={0}
        distortion={0.04}
        distortionScale={0.35}
        temporalDistortion={0}
        color={body}
        attenuationColor={palette.glassDepth}
        // Long: only thick parts take on violet, thin ones stay clear.
        attenuationDistance={palette.night ? 3 : 4}
        clearcoat={1}
        clearcoatRoughness={0.08}
        envMapIntensity={palette.night ? 1.7 : 1.15}
        background={background}
        backside={false}
        side={side}
      />
    );
  }

  // Opacity matched to tier 2's clear body: the paper shows through by day,
  // the night room a little less.
  return (
    <RimGlass
      tint={body}
      rim={rim ?? palette.rim}
      roughness={roughness}
      ior={ior}
      opacity={opacity ?? (palette.night ? 0.5 : 0.48)}
      side={side}
    />
  );
}
