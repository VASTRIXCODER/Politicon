'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  UnsignedByteType,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { damp } from 'maath/easing';
import { sceneStore, useSceneStore } from '@/lib/three/sceneStore';
import { SCENE_PALETTES } from '@/lib/three/palette';
import { NIGHT_LIVE_ATTR, animationClock, nightSections, trackedBoxes } from '@/components/three/runtime';

/*
 * The ambient light field: one full-screen shader behind every view and
 * every page.
 *
 *   Day    soft paper light. Slow violet light leaks and a faint beam from
 *          the upper left, an orchid haze, a whisper of warm gold low down,
 *          and the paper darkening a touch toward its edges.
 *   Night  the Chamber: deep violet with aurora curtains hanging from the top
 *          of the frame and a low glow on the horizon.
 *
 * The field is low-frequency, so it renders into a small half-float target
 * (half the CSS size on tier 2, a third on tier 1) and is stretched over the
 * canvas with a dithered blit; a frame that doesn't change the field only
 * pays for the blit. It drifts at <= 30 fps on marketing routes and is a still
 * frame elsewhere (and always under reduced motion), re-rendered only when
 * the theme, the size or a night section's position changes.
 *
 * Its edges match the CSS page background exactly (tokens canvas colour), so
 * the canvas fades in without a seam. Leaks are kept faint enough that body
 * text on top stays at WCAG AA in both themes.
 *
 * Night sections: any element with data-scene-night gets night light painted
 * behind it on a light page, so a section can dip into the Chamber and still
 * show 3D views. The night fills the element's own box, rounded corners
 * included (its border-radius), and ends at its edge; data-scene-night="bleed"
 * lets it fade out past the edges instead (full-bleed sections). Give such a
 * section its own night background (for tier 0 and until the stage is in):
 * once the field has drawn it, it carries data-scene-night-live and
 * app/globals.css makes that background transparent. Up to MAX_RECTS
 * sections are painted at once; any more keep their own backgrounds.
 */

const MAX_RECTS = 4;
/** How far a "bleed" night section fades out past its edges, in CSS px. */
const BLEED_PX = 48;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FIELD = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform float uScroll;
uniform vec2 uPointer;
uniform float uAspect;
uniform float uPhase;
// Night sections in CSS px, y up: left, bottom, right, top.
uniform vec4 uNightRects[MAX_RECTS];
// Per section: corner radius, and how far it bleeds past its edges (0: none).
uniform vec2 uNightShape[MAX_RECTS];
uniform int uNightCount;
// The canvas in CSS px, and one field texel in CSS px (the mask's soft edge).
uniform vec2 uSize;
uniform float uEdge;
uniform vec3 uDayBase;
uniform vec3 uDayTop;
uniform vec3 uDayLeak;
uniform vec3 uDayHaze;
uniform vec3 uDayWarm;
uniform vec3 uDayShade;
uniform vec3 uNightBase;
uniform vec3 uNightTop;
uniform vec3 uNightLeak;
uniform vec3 uNightHaze;
uniform vec3 uNightWarm;
uniform vec3 uNightShade;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  const mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = r * p * 2.02 + 11.7;
    a *= 0.5;
  }
  return v;
}

// A soft pool of light: 1 at its centre, fading out over its radii.
float pool(vec2 p, vec2 c, vec2 r) {
  vec2 d = (p - c) / r;
  return exp(-dot(d, d) * 1.6);
}

vec3 dayField(vec2 p, vec2 warp) {
  float t = uTime;
  vec3 col = mix(uDayBase, uDayTop, smoothstep(-0.4, 1.0, p.y));
  // Paper: a slow, low mottling. The CSS grain overlay supplies the fine tooth.
  col *= 1.0 + (fbm(p * 1.3 + vec2(3.1, uScroll * 0.8)) - 0.5) * 0.02;

  vec2 q = p + warp;
  // Violet light falling in from the upper left.
  vec2 c1 = vec2(-0.55 * uAspect, 0.95)
    + vec2(sin(t * 0.045 + uPhase) * 0.22, cos(t * 0.037) * 0.12)
    + uPointer * vec2(0.06, 0.04);
  float leak = pool(q, c1, vec2(0.6 + 0.45 * uAspect, 0.8));
  // Orchid haze on the right edge, drifting against the scroll.
  vec2 c2 = vec2(0.95 * uAspect, 0.05 - uScroll * 0.35)
    + vec2(cos(t * 0.031 + uPhase * 1.7) * 0.15, sin(t * 0.04) * 0.18);
  float haze = pool(q, c2, vec2(0.7, 0.85));
  // Warm light low on the page, like late sun on a desk.
  vec2 c3 = vec2(-0.25 * uAspect + sin(t * 0.027 + 2.0) * 0.25, -1.05);
  float warm = pool(q, c3, vec2(0.9, 0.5));
  // A faint diagonal beam from the same corner: law, turned into light.
  vec2 bd = normalize(vec2(0.82, -0.57));
  vec2 rel = q - c1;
  float across = dot(rel, vec2(-bd.y, bd.x));
  float along = dot(rel, bd);
  float beam = exp(-across * across * 9.0) * smoothstep(-0.2, 0.4, along) * exp(-max(along, 0.0) * 0.9);
  beam *= 0.75 + 0.25 * sin(t * 0.06 + along * 2.0);

  // Deliberately faint: body text sits on this and must stay at AA.
  col = mix(col, uDayLeak, clamp(leak * 0.12 + beam * 0.05, 0.0, 0.15));
  col = mix(col, uDayHaze, haze * 0.045);
  col = mix(col, uDayWarm, warm * 0.06);
  float edge = smoothstep(0.85, 1.5, length(vec2(p.x / uAspect, p.y)));
  return mix(col, uDayShade, edge);
}

vec3 nightField(vec2 p, vec2 warp) {
  float t = uTime;
  vec3 col = mix(uNightBase, uNightTop, smoothstep(-0.6, 1.1, p.y) * 0.7);
  // Across the screen from -1 to 1, whatever its shape.
  float x = p.x / max(uAspect, 0.5);
  float curtain = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // A slow, low-frequency mask breaks each curtain into separate drapes.
    float drape = smoothstep(0.3, 0.78, vnoise(vec2(x * (1.4 + fi * 0.5) + fi * 4.1 - t * 0.006, fi * 2.3 + 0.5)));
    // The hem: high in the sky, with a gentle wave and a smaller ripple.
    float n = fbm(vec2(x * (0.9 + fi * 0.5) + t * (0.008 + fi * 0.003) + fi * 3.7, fi * 1.9 + t * 0.005));
    float ripple = vnoise(vec2(x * 4.0 + fi * 7.3 + t * 0.02, fi * 3.1));
    float hem = 0.86 - fi * 0.14 + (n - 0.5) * 0.28 + (ripple - 0.5) * 0.07 + uScroll * 0.2 + uPointer.y * 0.02;
    float d = p.y - hem;
    // Brightest along the hem: a soft falloff below it, a long fade upward.
    float body = d < 0.0 ? exp(-d * d * 60.0) : exp(-d * (2.4 + fi * 0.8));
    // Rays that lean a little with height, like folds in a curtain: coarse
    // and contrasty enough to survive the low-res target, without plateaus.
    float fold = vnoise(vec2((x + d * 0.3) * (5.5 + fi * 1.7) + t * 0.025 + fi * 9.0, fi * 5.0));
    float rays = 0.25 + 0.75 * fold * fold;
    curtain += body * rays * drape * (0.85 - fi * 0.2);
  }
  // Headings and forms sit in the upper middle of the screen: keep the light
  // softer there, so the page reads before the sky does.
  float headerZone = (1.0 - smoothstep(0.6, 0.78, p.y)) * smoothstep(0.0, 0.2, p.y);
  curtain *= 1.0 - 0.45 * headerZone;
  float hue = smoothstep(-0.7, 0.9, x + sin(t * 0.021 + uPhase) * 0.35);
  vec3 aurora = mix(uNightLeak, uNightHaze, hue * 0.55);
  // Dim on purpose: muted text over the brightest curtain stays at AA.
  col += aurora * curtain * 0.08;
  // A low glow on the horizon, warmed a little at one side.
  float horizon = (p.y + 1.15) * 1.7;
  col += uNightLeak * exp(-horizon * horizon) * 0.03;
  col += uNightWarm * pool(p + warp, vec2(0.4 * uAspect, -1.1), vec2(0.8, 0.45)) * 0.012;
  float edge = smoothstep(0.7, 1.6, length(vec2(x, p.y)));
  return mix(col, uNightShade, edge * 0.85);
}

// Signed distance to a rounded rectangle (negative inside).
float sdRoundRect(vec2 p, vec2 halfSize, float r) {
  r = min(r, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float nightMask(vec2 uv) {
  vec2 px = uv * uSize;
  float m = 0.0;
  for (int i = 0; i < MAX_RECTS; i++) {
    if (i >= uNightCount) break;
    vec4 r = uNightRects[i];
    vec2 shape = uNightShape[i];
    float sd = sdRoundRect(px - (r.xy + r.zw) * 0.5, (r.zw - r.xy) * 0.5, shape.x);
    // Night up to the element's own (rounded) edge, or fading out past it.
    float k = shape.y > 0.0 ? 1.0 - smoothstep(0.0, shape.y, sd) : 1.0 - smoothstep(-uEdge, 0.0, sd);
    m = max(m, k);
  }
  return m;
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.x *= uAspect;
  vec2 warp = (vec2(fbm(p * 0.7 + uTime * 0.012), fbm(p * 0.7 - uTime * 0.01 + 7.3)) - 0.5) * 0.45;
  float night = max(uNight, nightMask(vUv));
  vec3 col;
  if (night <= 0.001) col = dayField(p, warp);
  else if (night >= 0.999) col = nightField(p, warp);
  else col = mix(dayField(p, warp), nightField(p, warp), night);
  gl_FragColor = vec4(col, 1.0);
}
`;

const BLIT = /* glsl */ `
uniform sampler2D uField;
varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  gl_FragColor = vec4(texture2D(uField, vUv).rgb, 1.0);
  #include <colorspace_fragment>
  // Triangular dither, so the soft gradients don't band on 8-bit screens.
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) + hash12(gl_FragCoord.xy + 17.17) - 1.0) / 255.0;
}
`;

/** A stable 0..2π phase per section name, so the light settles somewhere new in each section. */
function sectionPhase(section: string): number {
  let h = 0;
  for (let i = 0; i < section.length; i++) h = (h * 31 + section.charCodeAt(i)) | 0;
  return section ? ((Math.abs(h) % 628) / 100) : 0;
}

export interface AmbientFieldProps {
  /** Drift (marketing routes, under a mouse). Off: a still frame. */
  animated: boolean;
  reducedMotion: boolean;
  tier: 1 | 2;
}

export default function AmbientField({ animated, reducedMotion, tier }: AmbientFieldProps) {
  const theme = useSceneStore((s) => s.theme);
  const section = useSceneStore((s) => s.section);
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);

  const res = useMemo(() => {
    const geometry = new BufferGeometry();
    // One triangle that covers the screen (cheaper than a quad's diagonal seam).
    geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    // Half float keeps the gradients smooth; rendering to it needs an extension
    // that nearly every WebGL2 device has (8-bit plus the blit's dither otherwise).
    const halfFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');
    const target = new WebGLRenderTarget(2, 2, {
      type: halfFloat ? HalfFloatType : UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      magFilter: LinearFilter,
      minFilter: LinearFilter,
      generateMipmaps: false,
    });
    const d = SCENE_PALETTES.light.field;
    const n = SCENE_PALETTES.dark.field;
    const uniforms = {
      uTime: { value: 37 },
      uNight: { value: 0 },
      uScroll: { value: 0 },
      uPointer: { value: new Vector2() },
      uAspect: { value: 1 },
      uPhase: { value: 0 },
      uNightRects: { value: Array.from({ length: MAX_RECTS }, () => new Vector4()) },
      uNightShape: { value: Array.from({ length: MAX_RECTS }, () => new Vector2()) },
      uNightCount: { value: 0 },
      uSize: { value: new Vector2(1, 1) },
      uEdge: { value: 2 },
      uDayBase: { value: new Color(d.base) },
      uDayTop: { value: new Color(d.top) },
      uDayLeak: { value: new Color(d.leak) },
      uDayHaze: { value: new Color(d.haze) },
      uDayWarm: { value: new Color(d.warm) },
      uDayShade: { value: new Color(d.shade) },
      uNightBase: { value: new Color(n.base) },
      uNightTop: { value: new Color(n.top) },
      uNightLeak: { value: new Color(n.leak) },
      uNightHaze: { value: new Color(n.haze) },
      uNightWarm: { value: new Color(n.warm) },
      uNightShade: { value: new Color(n.shade) },
    };
    const fieldMaterial = new ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FIELD,
      defines: { MAX_RECTS },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    const blitMaterial = new ShaderMaterial({
      uniforms: { uField: { value: target.texture } },
      vertexShader: VERTEX,
      fragmentShader: BLIT,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
    const scene = (material: ShaderMaterial) => {
      const s = new Scene();
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      s.add(mesh);
      return s;
    };
    return { geometry, camera, target, uniforms, fieldMaterial, blitMaterial, fieldScene: scene(fieldMaterial), blitScene: scene(blitMaterial) };
  }, [gl]);

  useEffect(
    () => () => {
      res.geometry.dispose();
      res.target.dispose();
      res.fieldMaterial.dispose();
      res.blitMaterial.dispose();
    },
    [res]
  );

  const nightTarget = theme === 'dark' ? 1 : 0;
  const live = useRef({
    night: nightTarget,
    target: nightTarget,
    scroll: 0,
    px: 0,
    py: 0,
    phase: 0,
    phaseTarget: 0,
    animated,
    dirty: true,
    w: 0,
    h: 0,
    rectsKey: '',
  });
  const releaseTransition = useRef<(() => void) | null>(null);

  // Theme: cross-fade day ↔ night over about half a second (the CSS page
  // background fades in step), or switch at once under reduced motion.
  useEffect(() => {
    const s = live.current;
    s.target = nightTarget;
    s.dirty = true;
    if (reducedMotion) s.night = nightTarget;
    else if (s.night !== nightTarget && !releaseTransition.current) releaseTransition.current = animationClock.acquire(60);
    invalidate();
  }, [nightTarget, reducedMotion, invalidate]);

  useEffect(
    () => () => {
      releaseTransition.current?.();
      releaseTransition.current = null;
    },
    []
  );

  // Drift: a slow clock on marketing routes.
  useEffect(() => {
    live.current.animated = animated;
    live.current.dirty = true;
    invalidate();
    if (!animated) return;
    return animationClock.acquire(tier === 2 ? 30 : 24);
  }, [animated, tier, invalidate]);

  useEffect(() => {
    live.current.phaseTarget = sectionPhase(section);
  }, [section]);

  // Night sections on the page (StageLoader keeps the list): the stage
  // re-renders when one moves without a scroll, and each one painted carries
  // NIGHT_LIVE_ATTR.
  const painted = useRef(new Set<HTMLElement>());
  const radii = useRef(new WeakMap<HTMLElement, number>());
  const warned = useRef(false);
  useEffect(() => {
    const releases = new Map<HTMLElement, () => void>();
    const sync = () => {
      const found = nightSections.get();
      for (const [el, release] of releases) {
        if (!found.includes(el)) {
          release();
          releases.delete(el);
        }
      }
      for (const el of found) if (!releases.has(el)) releases.set(el, trackedBoxes.add(el));
      // Classes (and so radii) may have changed with the markup.
      radii.current = new WeakMap();
      live.current.dirty = true;
      invalidate();
    };
    sync();
    const unsubscribe = nightSections.subscribe(sync);
    const drawn = painted.current;
    return () => {
      unsubscribe();
      releases.forEach((release) => release());
      drawn.forEach((el) => el.removeAttribute(NIGHT_LIVE_ATTR));
      drawn.clear();
    };
  }, [invalidate]);

  useFrame((state, rawDelta) => {
    const { gl, size } = state;
    const s = live.current;
    const u = res.uniforms;
    // Long gaps between on-demand frames must not jump the drift.
    const delta = Math.min(rawDelta, 1 / 15);

    const scale = tier === 2 ? 0.5 : 0.35;
    let w = Math.max(2, Math.round(size.width * scale));
    let h = Math.max(2, Math.round(size.height * scale));
    const longest = Math.max(w, h);
    if (longest > 1280) {
      w = Math.round((w * 1280) / longest);
      h = Math.round((h * 1280) / longest);
    }
    if (w !== s.w || h !== s.h) {
      res.target.setSize(w, h);
      s.w = w;
      s.h = h;
      s.dirty = true;
      // Responsive classes can change a section's radius with the width.
      radii.current = new WeakMap();
    }

    if (s.night !== s.target) {
      damp(s, 'night', s.target, 0.18, delta, Infinity, undefined, 0.002);
      s.dirty = true;
    }
    if (s.night === s.target && releaseTransition.current) {
      releaseTransition.current();
      releaseTransition.current = null;
    }

    if (s.animated) {
      const { scroll, pointer } = sceneStore.get();
      u.uTime.value += delta;
      damp(s, 'scroll', scroll, 0.6, delta);
      damp(s, 'px', pointer.x, 0.9, delta);
      damp(s, 'py', pointer.y, 0.9, delta);
      damp(s, 'phase', s.phaseTarget, 1.6, delta);
      s.dirty = true;
    }

    // Night sections on screen, as rounded rectangles in CSS px (y up).
    let count = 0;
    let key = '';
    let onScreen = 0;
    const drawnNow: HTMLElement[] = [];
    for (const el of nightSections.get()) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < -BLEED_PX || r.top > size.height + BLEED_PX) continue;
      onScreen++;
      if (count >= MAX_RECTS) continue;
      let radius = radii.current.get(el);
      if (radius === undefined) {
        radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        radii.current.set(el, radius);
      }
      const bleed = el.dataset.sceneNight === 'bleed' ? BLEED_PX : 0;
      u.uNightRects.value[count].set(r.left, size.height - r.bottom, r.right, size.height - r.top);
      u.uNightShape.value[count].set(radius, bleed);
      key += `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)},${radius},${bleed};`;
      drawnNow.push(el);
      count++;
    }
    if (onScreen > MAX_RECTS && !warned.current && process.env.NODE_ENV !== 'production') {
      warned.current = true;
      console.warn(`Politicon: ${onScreen} night sections on screen; the stage paints ${MAX_RECTS}, the rest keep their own background.`);
    }
    if (key !== s.rectsKey || count !== u.uNightCount.value) {
      s.rectsKey = key;
      u.uNightCount.value = count;
      s.dirty = true;
      // Sections the field paints from this frame on lose their own background
      // (globals.css); the rest keep it.
      const drawn = painted.current;
      drawn.forEach((el) => {
        if (!drawnNow.includes(el)) {
          el.removeAttribute(NIGHT_LIVE_ATTR);
          drawn.delete(el);
        }
      });
      for (const el of drawnNow) {
        if (!drawn.has(el)) {
          el.setAttribute(NIGHT_LIVE_ATTR, '');
          drawn.add(el);
        }
      }
    }

    if (s.dirty) {
      u.uNight.value = s.night;
      u.uScroll.value = s.scroll;
      u.uPointer.value.set(s.px, s.py);
      u.uPhase.value = s.phase;
      u.uAspect.value = size.width / Math.max(1, size.height);
      u.uSize.value.set(size.width, size.height);
      u.uEdge.value = size.width / w;
      gl.setRenderTarget(res.target);
      gl.render(res.fieldScene, res.camera);
      s.dirty = false;
    }

    // The page itself: clear everything (views draw on top next), then blit.
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, size.width, size.height);
    gl.setScissorTest(false);
    gl.clear(true, true, false);
    gl.render(res.blitScene, res.camera);
    gl.autoClear = autoClear;
  }, 1);

  return null;
}
