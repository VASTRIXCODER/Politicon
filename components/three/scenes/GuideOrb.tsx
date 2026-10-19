'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, IcosahedronGeometry, NormalBlending, ShaderMaterial, type Group } from 'three';
import { damp } from 'maath/easing';
import SceneCamera from '@/components/three/kit/SceneCamera';
import PostFX from '@/components/three/kit/PostFX';
import { useAnimated, useKitTier, useScenePalette } from '@/components/three/kit/hooks';
import { mixHex } from '@/lib/three/palette';
import { HALO_FRAGMENT, HALO_VERTEX, MOTE_FRAGMENT, MOTE_VERTEX, ORB_FRAGMENT, ORB_VERTEX } from '@/components/three/scenes/parts/guideOrbShaders';

/*
 * The Policy Guide's presence: a sphere of violet light whose surface is
 * pushed in and out by slow 3D noise, lit from inside by a fresnel rim of
 * lilac and orchid, with a soft halo behind it and a few motes of light
 * circling it.
 *
 *   idle      it breathes: a slow swell (about one breath every 6.5 s) and
 *             a calm, low surface
 *   thinking  the surface swirls: the noise field twists around the
 *             vertical axis, rises and quickens, and the motes speed up
 *   speaking  a livelier surface; every increment of `pulse` (one per word
 *             of the arriving reply, see components/guide/orbVoice.ts) sends
 *             a ripple of light through it that decays in a fraction of a
 *             second
 *
 * Under reduced motion (or "Pause motion") it is one composed still frame
 * per state and ignores pulses. Tier 1 draws a coarser sphere with a
 * single octave of noise and no recomputed normals (the fresnel reads the
 * sphere's own normals); tier 2 adds a second octave, finite-difference
 * normals and the stage's subtle bloom. No lights, no environment, no
 * textures: one shader, one halo quad and one draw of motes. It holds the
 * stage's clock at 30 fps while idle (a breath needs no more) and at the
 * tier's full rate while thinking or speaking.
 */

export type GuideOrbState = 'idle' | 'thinking' | 'speaking';

export interface GuideOrbProps {
  state: GuideOrbState;
  /** Increments once per streamed token (word): each step sends a ripple of light through the orb. */
  pulse?: number;
}

/** How each state moves: surface height, noise frequency, flow speed, swirl speed (rad/s), mote orbit (rad/s), glow. */
const MOODS: Record<GuideOrbState, { amp: number; freq: number; flow: number; swirl: number; orbit: number; energy: number }> = {
  idle: { amp: 0.07, freq: 1.1, flow: 0.16, swirl: 0.05, orbit: 0.1, energy: 0.55 },
  thinking: { amp: 0.11, freq: 1.45, flow: 0.5, swirl: 1.25, orbit: 0.85, energy: 0.85 },
  speaking: { amp: 0.085, freq: 1.25, flow: 0.32, swirl: 0.3, orbit: 0.3, energy: 0.75 },
};

/** The still frame's clock and swirl (reduced motion): a composed, slightly turned surface. */
const STILL = { time: 2.4, swirl: 0.7 };
/** One breath, in seconds. */
const BREATH_PERIOD = 6.5;
/** How fast a pulse fades (per second, exponential). */
const PULSE_DECAY = 7;

/**
 * The camera frames the orb (radius 1, about 1.15 at its swells) at about
 * two thirds of the box, like the CSS poster, with room for the motes.
 */
const CAMERA_Z = 6.5;
const FOV = 27;

/** Motes of light on three tilted rings around the orb, all inside the frame (a fixed seed: the same every visit). */
function moteGeometry(count: number): BufferGeometry {
  const rings = [
    { r: 1.24, tilt: 0.42, turn: 0 },
    { r: 1.36, tilt: -0.3, turn: 1.1 },
    { r: 1.17, tilt: 0.12, turn: 2.2 },
  ];
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    const { r, tilt, turn } = rings[i % rings.length];
    const a = random() * Math.PI * 2 + turn;
    const radius = r + (random() - 0.5) * 0.08;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    const lift = (random() - 0.5) * 0.06;
    positions.set([x, z * Math.sin(tilt) + lift, z * Math.cos(tilt)], i * 3);
    seeds[i] = random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  return geometry;
}

export default function GuideOrb({ state, pulse = 0 }: GuideOrbProps) {
  const palette = useScenePalette();
  const tier = useKitTier();
  // A breath needs no more than 30 fps; a swirl and a pulse get the tier's full rate.
  const animated = useAnimated(state === 'idle' ? 30 : undefined);
  const invalidate = useThree((s) => s.invalidate);
  const dpr = useThree((s) => s.viewport.dpr);
  const motes = useRef<Group>(null);
  // The orb's live values, eased toward the state's mood every frame (refs, not state).
  const live = useRef({
    t: STILL.time,
    swirl: STILL.swirl,
    breathT: 0,
    pulse: 0,
    amp: MOODS[state].amp,
    freq: MOODS[state].freq,
    flow: MOODS[state].flow,
    spin: MOODS[state].swirl,
    orbit: MOODS[state].orbit,
    energy: MOODS[state].energy,
  });

  const geometry = useMemo(() => new IcosahedronGeometry(1, tier === 2 ? 36 : 16), [tier]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const moteCloud = useMemo(() => moteGeometry(tier === 2 ? 150 : 72), [tier]);
  useEffect(() => () => moteCloud.dispose(), [moteCloud]);

  const orb = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTime: { value: STILL.time },
          uAmp: { value: MOODS.idle.amp },
          uFreq: { value: MOODS.idle.freq },
          uSwirl: { value: STILL.swirl },
          uPulse: { value: 0 },
          uBreath: { value: 1 },
          uCore: { value: new Color() },
          uMid: { value: new Color() },
          uRim: { value: new Color() },
          uGlow: { value: new Color() },
          uEnergy: { value: MOODS.idle.energy },
        },
        defines: tier === 2 ? { DETAILED: '' } : {},
        vertexShader: ORB_VERTEX,
        fragmentShader: ORB_FRAGMENT,
      }),
    [tier]
  );
  const halo = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uColor: { value: new Color() }, uStrength: { value: 0.6 } },
        vertexShader: HALO_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  const mote = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: STILL.time }, uSize: { value: 26 }, uColor: { value: new Color() }, uOpacity: { value: 0.7 } },
        vertexShader: MOTE_VERTEX,
        fragmentShader: MOTE_FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  useEffect(() => () => orb.dispose(), [orb]);
  useEffect(() => () => halo.dispose(), [halo]);
  useEffect(() => () => mote.dispose(), [mote]);
  // Point sizes are in device pixels.
  useEffect(() => {
    mote.uniforms.uSize.value = 24 * dpr;
    invalidate();
  }, [mote, dpr, invalidate]);

  // Night: light on a dark room (an additive halo). Day (the lab): a pale violet wash.
  useEffect(() => {
    const u = orb.uniforms;
    if (palette.night) {
      u.uCore.value.set(mixHex(palette.surface, palette.violet, 0.42));
      u.uMid.value.set(mixHex(palette.violet, palette.accent, 0.35));
      u.uRim.value.set(mixHex(palette.violetLight, '#FFFFFF', 0.3));
      u.uGlow.value.set(palette.glow);
    } else {
      u.uCore.value.set(mixHex(palette.violet, palette.ink, 0.25));
      u.uMid.value.set(mixHex(palette.violet, palette.accent, 0.3));
      u.uRim.value.set(mixHex(palette.violetLight, '#FFFFFF', 0.45));
      u.uGlow.value.set(palette.violetLight);
    }
    halo.uniforms.uColor.value.set(palette.night ? palette.violet : palette.violetLight);
    mote.uniforms.uColor.value.set(palette.night ? palette.violetLight : palette.violet);
    mote.uniforms.uOpacity.value = palette.night ? 0.75 : 0.5;
    const blending = palette.night ? AdditiveBlending : NormalBlending;
    for (const m of [halo, mote]) {
      if (m.blending !== blending) {
        m.blending = blending;
        m.needsUpdate = true;
      }
    }
    invalidate();
  }, [orb, halo, mote, palette, invalidate]);

  // Each new pulse sends a ripple of light through the surface (never under reduced motion).
  const seenPulse = useRef(pulse);
  useEffect(() => {
    if (pulse === seenPulse.current) return;
    seenPulse.current = pulse;
    if (!animated) return;
    live.current.pulse = Math.min(1, live.current.pulse + 0.55);
  }, [pulse, animated]);

  // The still frame changes with the state: draw it again.
  useEffect(() => {
    if (!animated) invalidate();
  }, [state, animated, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const s = live.current;
    const mood = MOODS[state];
    const u = orb.uniforms;
    if (animated) {
      // Ease between moods rather than snapping (damping over timelines).
      damp(s, 'amp', mood.amp, 0.45, dt);
      damp(s, 'freq', mood.freq, 0.6, dt);
      damp(s, 'flow', mood.flow, 0.5, dt);
      damp(s, 'spin', mood.swirl, 0.5, dt);
      damp(s, 'orbit', mood.orbit, 0.6, dt);
      damp(s, 'energy', mood.energy, 0.35, dt);
      s.t += dt * s.flow;
      s.swirl += dt * s.spin;
      s.breathT += dt;
      s.pulse *= Math.exp(-dt * PULSE_DECAY);
      u.uBreath.value = 1 + Math.sin((s.breathT / BREATH_PERIOD) * Math.PI * 2) * (state === 'idle' ? 0.03 : 0.015);
      if (motes.current) motes.current.rotation.y += dt * s.orbit;
    } else {
      // The composed still frame for this state.
      s.amp = mood.amp;
      s.freq = mood.freq;
      s.energy = mood.energy;
      s.t = STILL.time;
      s.swirl = state === 'thinking' ? STILL.swirl * 1.8 : STILL.swirl;
      s.pulse = 0;
      u.uBreath.value = 1;
    }
    u.uTime.value = s.t;
    u.uSwirl.value = s.swirl;
    u.uAmp.value = s.amp;
    u.uFreq.value = s.freq;
    u.uEnergy.value = s.energy;
    u.uPulse.value = s.pulse;
    mote.uniforms.uTime.value = s.t * 4;
    halo.uniforms.uStrength.value = (palette.night ? 0.55 : 0.4) * (0.75 + 0.45 * s.energy + 0.5 * s.pulse);
  });

  return (
    <>
      <SceneCamera position={[0, 0, CAMERA_Z]} fov={FOV} />
      <mesh position={[0, 0, -1.2]} material={halo} renderOrder={0}>
        <planeGeometry args={[4.4, 4.4]} />
      </mesh>
      <mesh geometry={geometry} material={orb} rotation={[0.25, 0.4, 0]} renderOrder={1} />
      <group ref={motes} rotation={[0.18, 0, -0.12]}>
        <points geometry={moteCloud} material={mote} renderOrder={2} />
      </group>
      <PostFX />
    </>
  );
}
