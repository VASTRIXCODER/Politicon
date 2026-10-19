/*
 * The shaders of the Policy Guide's orb (components/three/scenes/GuideOrb):
 * the noise-displaced sphere of light, the halo behind it and its motes.
 * Plain GLSL strings, three-free, so they can be compiled on their own for
 * checks. DETAILED (tier 2) adds a second octave of noise and normals of
 * the displaced surface; without it (tier 1) the fresnel reads the sphere's
 * own normals.
 */

// Simplex noise in 3D: Ian McEwan and Stefan Gustavson, Ashima Arts
// (webgl-noise, MIT licence).
const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const ORB_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmp;
uniform float uFreq;
uniform float uSwirl;
uniform float uPulse;
uniform float uBreath;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vField;
${NOISE}

// The noise field on the unit sphere, twisted around the vertical axis
// (more toward the poles, so the surface reads as a swirl, not a spin).
float field(vec3 p) {
  float a = uSwirl * (1.0 + p.y * 0.6);
  float c = cos(a);
  float s = sin(a);
  vec3 q = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
  float n = snoise(q * uFreq + vec3(0.0, uTime, uTime * 0.37));
#ifdef DETAILED
  n = (n + 0.3 * snoise(q * uFreq * 2.1 - vec3(uTime * 1.31, 0.0, uTime * 0.6))) / 1.3;
#endif
  return n;
}

// How far a point on the unit sphere is pushed out (a pulse lifts the
// whole surface a little and rings it with a band of ripples).
float lift(vec3 p, float n) {
  float ripple = sin(p.y * 7.0 - uTime * 9.0) * 0.5 + 0.5;
  return 1.0 + n * uAmp + uPulse * (0.035 + 0.05 * ripple);
}

void main() {
  vec3 p = normalize(position);
  float n = field(p);
  vec3 displaced = p * lift(p, n);
#ifdef DETAILED
  // Normals of the displaced surface, from two nearby points on it.
  vec3 helper = abs(p.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t = normalize(cross(helper, p));
  vec3 b = cross(p, t);
  float e = 0.015;
  vec3 pt = normalize(p + t * e);
  vec3 pb = normalize(p + b * e);
  vec3 dt = pt * lift(pt, field(pt)) - displaced;
  vec3 db = pb * lift(pb, field(pb)) - displaced;
  vec3 nrm = normalize(cross(dt, db));
  if (dot(nrm, p) < 0.0) nrm = -nrm;
#else
  vec3 nrm = p;
#endif
  vec4 world = modelMatrix * vec4(displaced * uBreath, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * nrm);
  vViewDir = normalize(cameraPosition - world.xyz);
  vField = n;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const ORB_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uRim;
uniform vec3 uGlow;
uniform float uEnergy;
uniform float uPulse;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying float vField;
void main() {
  vec3 n = normalize(vNormalW);
  float facing = clamp(dot(n, normalize(vViewDir)), 0.0, 1.0);
  float fresnel = pow(1.0 - facing, 2.4);
  // Deep violet in the hollows, orchid-violet on the swells.
  vec3 color = mix(uCore, uMid, smoothstep(-0.55, 0.6, vField));
  // The rim of light, brighter with energy and with each pulse.
  color = mix(color, uRim, clamp(fresnel * (0.75 + 0.35 * uEnergy), 0.0, 1.0));
  // A soft highlight from the upper left, like the mark's rim light.
  float key = clamp(dot(n, normalize(vec3(-0.45, 0.7, 0.55))), 0.0, 1.0);
  color += uGlow * (pow(key, 7.0) * 0.3 + fresnel * 0.22 * uEnergy);
  // Light from within: the heart of the orb glows a little brighter.
  color += uGlow * pow(facing, 4.0) * 0.16 * uEnergy;
  color += uRim * uPulse * (0.12 + 0.3 * fresnel);
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;

export const HALO_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A soft disc of light behind the orb, gone well inside the quad (and, from
// where the camera sits, inside the view's box, so the glow never shows the
// box's square edge).
export const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float glow = exp(-d * d * 3.2) * (1.0 - smoothstep(0.55, 0.82, d));
  gl_FragColor = vec4(uColor, glow * uStrength);
  #include <colorspace_fragment>
}
`;

export const MOTE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;
attribute float aSeed;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vTwinkle = 0.55 + 0.45 * sin(uTime * (1.3 + aSeed * 1.7) + aSeed * 40.0);
  gl_PointSize = uSize * (0.6 + aSeed * 0.8) / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

// A soft round mote, twinkling.
export const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * uOpacity * vTwinkle);
  #include <colorspace_fragment>
}
`;
