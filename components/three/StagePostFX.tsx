'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Pass } from 'postprocessing';
import {
  FramebufferTexture,
  HalfFloatType,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  type Camera,
  type Scene,
  type WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { useSceneStore } from '@/lib/three/sceneStore';
import { postFxRequests, usePostFxVignette } from '@/components/three/runtime';

/*
 * Tier-2 effects (subtle bloom, and a vignette for full-bleed views), run
 * once per frame over the boxes of
 * the views that asked for them with <PostFX /> (components/three/kit/PostFX.tsx).
 *
 * Views draw straight into the canvas (drei View), so the effect chain can't
 * own their render. Instead its first pass copies the finished frame (the
 * ambient field plus every view) into the composer's input, and the last pass
 * writes the result back, scissored to the requesting boxes. The frame is
 * opaque there (the field is), so no alpha is lost. Loaded on first request
 * only, never on tier 1.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

// The canvas holds sRGB; the effect chain works in linear light.
const DECODE = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
vec3 toLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
void main() {
  vec4 texel = texture2D(map, vUv);
  gl_FragColor = vec4(toLinear(texel.rgb), texel.a);
}
`;

/** Copies the frame drawn so far into the composer's input buffer. */
class CanvasInputPass extends Pass {
  private frame = new FramebufferTexture(1, 1);
  private readonly material: ShaderMaterial;
  private readonly size = new Vector2();

  constructor() {
    super('CanvasInputPass');
    this.needsSwap = false;
    this.material = new ShaderMaterial({
      uniforms: { map: { value: this.frame } },
      vertexShader: VERTEX,
      fragmentShader: DECODE,
      depthTest: false,
      depthWrite: false,
    });
    this.fullscreenMaterial = this.material;
  }

  render(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget | null) {
    renderer.getDrawingBufferSize(this.size);
    const { width, height } = this.frame.image as { width: number; height: number };
    if (width !== this.size.x || height !== this.size.y) {
      this.frame.dispose();
      this.frame = new FramebufferTexture(this.size.x, this.size.y);
      this.material.uniforms.map.value = this.frame;
    }
    renderer.setRenderTarget(null);
    renderer.copyFramebufferToTexture(this.frame);
    renderer.setRenderTarget(this.renderToScreen ? null : inputBuffer);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.frame.dispose();
    super.dispose();
  }
}

// Module-level so the composer isn't rebuilt on every render.
const canvasInput = (_scene: Scene, _camera: Camera) => new CanvasInputPass();

/** Clips the effect output to the requesting boxes, then restores the renderer. */
function FxScissor() {
  useFrame(({ gl, size }) => {
    gl.setRenderTarget(null);
    gl.setViewport(0, 0, size.width, size.height);
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    let whole = false;
    postFxRequests.forEach((box) => {
      if (!box) {
        whole = true;
        return;
      }
      const r = box.getBoundingClientRect();
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    });
    if (whole || !Number.isFinite(left)) {
      gl.setScissorTest(false);
      return;
    }
    const x = Math.max(0, Math.floor(left));
    const y = Math.max(0, Math.floor(size.height - bottom));
    const w = Math.max(0, Math.min(size.width, Math.ceil(right)) - x);
    const h = Math.max(0, Math.min(size.height, Math.ceil(size.height - top)) - y);
    gl.setScissor(x, y, w, h);
    gl.setScissorTest(true);
  }, 999);
  useFrame(({ gl }) => gl.setScissorTest(false), 1001);
  return null;
}

export default function StagePostFX({ enabled }: { enabled: boolean }) {
  const night = useSceneStore((s) => s.theme) === 'dark';
  const vignette = usePostFxVignette();
  const gl = useThree((s) => s.gl);
  const halfFloat = gl.extensions.has('EXT_color_buffer_float') || gl.extensions.has('EXT_color_buffer_half_float');

  return (
    <>
      {enabled && <FxScissor />}
      <EffectComposer
        enabled={enabled}
        renderPass={canvasInput}
        renderPriority={1000}
        multisampling={0}
        depthBuffer={false}
        frameBufferType={halfFloat ? HalfFloatType : UnsignedByteType}
      >
        {/* By day the paper itself is bright, so only true highlights bloom. */}
        <Bloom
          mipmapBlur
          luminanceThreshold={night ? 0.5 : 0.96}
          luminanceSmoothing={night ? 0.3 : 0.04}
          intensity={night ? 0.6 : 0.25}
          radius={0.7}
        />
        {/* Screen-wide, so only for full-bleed views that asked for it. */}
        <Vignette offset={0.42} darkness={vignette ? (night ? 0.5 : 0.2) : 0} />
      </EffectComposer>
    </>
  );
}
