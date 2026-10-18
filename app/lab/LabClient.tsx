'use client';

import { lazy, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Surface from '@/components/ui/Surface';
import ThemeChoice from '@/components/ui/ThemeChoice';
import EffectsChoice from '@/components/ui/EffectsChoice';
import SceneView from '@/components/three/SceneView';
import {
  ApertureDome3D,
  BillSheet,
  CapitolDome,
  LightParticles,
  PostFX,
  SceneCamera,
  StudioLights,
} from '@/components/three/kit/lazy';
import { usePrefersReducedMotion, useStageStatus } from '@/components/three/runtime';
import { fxOverrideAllowed, useTierDetails } from '@/lib/three/tier';
import { MARK_PATHS, MARK_VIEWBOX } from '@/lib/brand/mark';
import { cn } from '@/lib/utils';

// QA-only scenes, loaded like the kit (never in this page's first load).
const GlassSpecimen = lazy(() => import('@/components/three/lab/Specimens').then((m) => ({ default: m.GlassSpecimen })));
const LightingSpecimen = lazy(() => import('@/components/three/lab/Specimens').then((m) => ({ default: m.LightingSpecimen })));
const GlassTierSpecimen = lazy(() => import('@/components/three/lab/Specimens').then((m) => ({ default: m.GlassTierSpecimen })));

// ---------------------------------------------------------------------------
// Posters: the CSS stand-ins every SceneView shows on tier 0 and until its
// scene has drawn. Decorative (SceneView hides them from assistive tech).

function MarkPoster({ className }: { className?: string }) {
  const id = useId();
  return (
    <div className={cn('absolute inset-0 flex items-center justify-center', className)}>
      <div className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgb(var(--c-glow)/0.32),transparent)]" />
      <svg viewBox={MARK_VIEWBOX} className="relative h-[58%] w-auto text-primary drop-shadow-[0_18px_32px_rgb(var(--c-violet)/0.35)]">
        <defs>
          <linearGradient id={`${id}shell`} x1="0.15" y1="0" x2="0.7" y2="1">
            {/* Presentation attributes can't read CSS variables; style can. */}
            <stop offset="0" style={{ stopColor: 'rgb(var(--c-glow))' }} />
            <stop offset="0.6" stopColor="currentColor" />
            <stop offset="1" style={{ stopColor: 'rgb(var(--c-violet-text))' }} />
          </linearGradient>
        </defs>
        <path d={MARK_PATHS.aperture} fill="#FFFFFF" />
        <path d={MARK_PATHS.dome + MARK_PATHS.base} fill={`url(#${id}shell)`} />
      </svg>
    </div>
  );
}

function CapitolPoster() {
  return (
    <div className="absolute inset-0 flex items-end justify-center pb-[14%]">
      <svg viewBox="0 0 340 220" className="w-[78%]">
        <ellipse cx="170" cy="212" rx="160" ry="8" className="fill-fg/8" />
        <g className="fill-surface stroke-fg/15" strokeWidth="1">
          <rect x="0" y="198" width="340" height="12" rx="1" />
          <rect x="15" y="186" width="310" height="12" rx="1" />
          <rect x="30" y="172" width="280" height="14" rx="1" />
          <rect x="50" y="138" width="240" height="34" />
          <rect x="45" y="134" width="250" height="5" />
          <rect x="104" y="96" width="132" height="38" />
          <rect x="100" y="90" width="140" height="6" />
          <rect x="112" y="78" width="116" height="12" />
          <path d="M115 78 C 115 30, 150 14, 170 12 C 190 14, 225 30, 225 78 Z" />
          <rect x="163" y="2" width="14" height="12" rx="2" />
        </g>
        <g className="stroke-fg/20" strokeWidth="2.5" strokeLinecap="round">
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1={112 + i * 11.6} y1="100" x2={112 + i * 11.6} y2="130" />
          ))}
        </g>
      </svg>
    </div>
  );
}

function BillPoster({ glass = false }: { glass?: boolean }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center [perspective:900px]">
      <div
        className={cn(
          'relative aspect-[8.5/11] h-[70%] rounded-[5%] border shadow-lift [transform:rotateY(-16deg)_rotateX(6deg)]',
          glass ? 'border-primary/30 bg-primary/10 backdrop-blur-sm' : 'border-fg/10 bg-paper'
        )}
      >
        <div className="absolute left-[9%] top-[10%] h-[3.4%] w-[60%] rounded-sm bg-ink/20" />
        <div className="absolute left-[9%] top-[16%] h-[1.8%] w-[38%] rounded-sm bg-ink/15" />
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="absolute left-[9%] h-[1.1%] rounded-sm bg-ink/10"
            style={{ top: `${25 + i * 5}%`, width: i % 4 === 3 ? '54%' : '82%' }}
          />
        ))}
        <div className="absolute bottom-[8%] right-[8%] aspect-square w-[22%] rounded-full border-2 border-gold/70 bg-gold/30" />
      </div>
    </div>
  );
}

function ParticlesPoster() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 300 200" className="w-[86%] text-primary" fill="none" stroke="currentColor" strokeLinecap="round">
        {Array.from({ length: 7 }, (_, i) => {
          const t = i / 6 - 0.5;
          return (
            <path
              key={i}
              d={`M20 ${100 - t * 8} C 90 ${60 - t * 80}, 180 ${120 - t * 110}, 280 ${100 - t * 75}`}
              strokeWidth="2.2"
              strokeDasharray="0.1 9"
              opacity={0.35 + (1 - Math.abs(t)) * 0.4}
            />
          );
        })}
      </svg>
    </div>
  );
}

function GlassPoster() {
  const bars = ['bg-ink', 'bg-primary', 'bg-gold', 'bg-gain-fill', 'bg-loss-fill', 'bg-accent'];
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="absolute inset-x-[18%] inset-y-[14%] flex justify-between">
        {bars.map((b) => (
          <div key={b} className={cn('w-[7%] rounded-sm opacity-70', b)} />
        ))}
      </div>
      <div className="relative aspect-square w-[42%] rounded-full border border-primary/30 bg-primary/15 shadow-glow backdrop-blur-md" />
    </div>
  );
}

function LightingPoster() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[6%]">
      <div className="aspect-square w-[20%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#FFFFFF,#E7E3EF_55%,#A9A3C2)]" />
      <div className="aspect-square w-[20%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#B9A8FF,#6D4AFF_55%,#3B2799)]" />
      <div className="aspect-square w-[20%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#FFF1C4,#E3B341_50%,#7A5C0A)]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls

function Readout() {
  const d = useTierDetails();
  const status = useStageStatus();
  const reduced = usePrefersReducedMotion();
  const env = d.env;
  const yesNo = (v: boolean | undefined) => (v ? 'yes' : 'no');
  const rows: [string, ReactNode][] = [
    ['Tier in effect', <span key="t" className="font-mono-data text-lg text-ink">{d.probed ? d.tier : '…'}</span>],
    ['Detected', d.probed ? `${d.detected}${d.cap < 2 ? ` (capped at ${d.cap} this session)` : ''}` : 'probing'],
    ['Stage', status],
    ['WebGL2', d.probed ? yesNo(env.webgl2) : '…'],
    ['Software renderer', d.probed ? yesNo(env.softwareRenderer) : '…'],
    ['Touch screen', yesNo(env.coarsePointer)],
    ['Memory', env.deviceMemory ? `${env.deviceMemory} GB` : 'not reported'],
    ['CPU cores', env.hardwareConcurrency ? String(env.hardwareConcurrency) : 'not reported'],
    ['Data Saver', yesNo(env.saveData)],
    ['Reduced motion', yesNo(reduced)],
    ['Override (?fx)', env.override != null ? String(env.override) : 'none'],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-fg/8 py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------

function Specimen({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
      {children}
      <div>
        <h3 className="font-display text-lg font-medium text-ink">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{note}</p>
      </div>
    </Surface>
  );
}

export default function LabClient() {
  const [progress, setProgress] = useState(0.5);
  const progressId = useId();
  const showOverrides = fxOverrideAllowed();

  return (
    <main id="main" tabIndex={-1} className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
      <p className="mb-10 text-sm">
        <Link href="/" className="text-primary-300 underline underline-offset-4">
          Politicon
        </Link>
        <span className="text-muted"> / Lab</span>
      </p>

      <PageHeader
        eyebrow="Internal · not indexed"
        title={<em>Lab</em>}
        lede="Every piece of the 3D kit on the shared stage, for visual QA in both themes and every tier. Where WebGL is off (tier 0), each box shows the poster it falls back to."
        actions={<ThemeChoice />}
      />

      <Surface as="section" variant="glass" pad="md" className="mt-10" aria-labelledby="lab-device">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <h2 id="lab-device" className="font-display text-display-sm font-medium text-ink">
            Device
          </h2>
          <div>
            <p id="lab-effects" className="mb-2 text-sm font-medium text-ink">
              Visual effects
            </p>
            <EffectsChoice labelledBy="lab-effects" />
          </div>
        </div>
        <Readout />
        {showOverrides && (
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
            Force a tier for this tab:
            {['auto', '0', '1', '2'].map((v) => (
              // Plain links: the tier is read when the page loads.
              <a key={v} href={`?fx=${v}`} className="font-mono-data text-primary-300 underline underline-offset-4">
                ?fx={v}
              </a>
            ))}
          </p>
        )}
      </Surface>

      <section className="mt-14" aria-labelledby="lab-hero">
        <h2 id="lab-hero" className="font-display text-display-sm font-medium text-ink">
          The <em>Aperture Dome</em>
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          The mark extruded from the logo&apos;s own paths, in violet glass with a rim light. It leans toward the mouse.
          Tier 2 adds real refraction and the effect pass (a soft bloom on the lens).
        </p>
        <SceneView eager className="mt-6 aspect-[16/10] w-full sm:aspect-[16/8]" poster={<MarkPoster />} label="The Politicon mark, the Aperture Dome, in violet glass">
          <SceneCamera position={[0, 0.02, 3.3]} fov={30} />
          <StudioLights />
          <ApertureDome3D size={1.5} />
          <PostFX />
        </SceneView>
      </section>

      <section className="mt-16" aria-labelledby="lab-kit">
        <h2 id="lab-kit" className="font-display text-display-sm font-medium text-ink">
          Kit
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Specimen title="Capitol dome" note="Procedural: lathe dome, instanced columns and ribs, stepped plinth, porcelain with baked occlusion. The lantern lights at night.">
            <SceneView className="aspect-square" poster={<CapitolPoster />} label="A porcelain model of the Capitol dome">
              <SceneCamera position={[3.6, 2, 5.4]} target={[0, 0.85, 0]} fov={30} />
              <StudioLights />
              <CapitolDome spin />
            </SceneView>
          </Specimen>

          <Specimen title="Bill sheet, paper" note="Letter proportions, embossed title and text lines, an archive-gold seal stamped with the mark.">
            <SceneView className="aspect-square" poster={<BillPoster />} label="A bill as a sheet of paper with a gold seal">
              <SceneCamera position={[0.5, 0.15, 2.2]} fov={30} />
              <StudioLights />
              <BillSheet rotation={[0, -0.3, 0]} />
            </SceneView>
          </Specimen>

          <Specimen title="Bill sheet, glass" note="The same sheet as light: the version that leaves the Capitol in the landing film.">
            <SceneView className="aspect-square" poster={<BillPoster glass />} label="A bill as a sheet of violet glass">
              <SceneCamera position={[-0.5, 0.15, 2.2]} fov={30} />
              <StudioLights />
              <BillSheet material="glass" rotation={[0, 0.3, 0]} />
            </SceneView>
          </Specimen>

          <Specimen title="Light particles, flowing" note="Streams along spline curves on the GPU. Capped at 4k on tier 1 and 25k on tier 2.">
            <SceneView className="aspect-square" poster={<ParticlesPoster />} label="Streams of violet light">
              <SceneCamera position={[0, 0, 5]} fov={30} />
              <LightParticles count={20000} />
            </SceneView>
          </Specimen>

          <Specimen title="Light particles, scrubbed" note="Progress drives a staggered dissolve and settle: start (the sheet), in flight, settled (the ledger).">
            <SceneView className="aspect-square" poster={<ParticlesPoster />} label="Particles of light gathering at the end of their paths">
              <SceneCamera position={[0, 0, 5]} fov={30} />
              <LightParticles count={12000} progress={progress} />
            </SceneView>
            <label htmlFor={progressId} className="flex items-center gap-3 text-sm text-muted">
              Progress
              <input
                id={progressId}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <span className="w-10 text-right font-mono-data text-ink">{progress.toFixed(2)}</span>
            </label>
          </Specimen>

          <Specimen title="Glass material" note="Tier 2: transmission (refracts the bars). Tier 1: physical glass with a fresnel rim, no extra pass.">
            <SceneView className="aspect-square" poster={<GlassPoster />} label="A glass knot in front of coloured bars">
              <SceneCamera position={[0, 0, 3.6]} fov={30} />
              <StudioLights />
              <GlassSpecimen />
            </SceneView>
          </Specimen>

          <Specimen title="Glass, tier 1 beside tier 2" note="The same mark in the rim-lit stand-in (left) and real transmission (right), forced whatever this device's tier. They must read as one material.">
            <SceneView className="aspect-square" poster={<div className="absolute inset-0 flex"><MarkPoster className="relative w-1/2" /><MarkPoster className="relative w-1/2" /></div>} label="The mark in tier-1 and tier-2 glass, side by side">
              <SceneCamera position={[0, 0.02, 3.4]} fov={30} />
              <StudioLights />
              <GlassTierSpecimen />
            </SceneView>
          </Specimen>

          <Specimen title="Studio lights" note="Lightformer environment plus key and violet rim lights, on matte porcelain, satin violet and gold metal.">
            <SceneView className="aspect-square" poster={<LightingPoster />} label="Three spheres under the studio lights">
              <SceneCamera position={[0, 0.6, 4.4]} target={[0, -0.15, 0]} fov={30} />
              <StudioLights />
              <LightingSpecimen />
            </SceneView>
          </Specimen>
        </div>
      </section>

      <section
        className="mt-16 rounded-pane bg-canvas px-5 py-10 sm:px-10"
        aria-labelledby="lab-night"
        data-night=""
        data-scene-night=""
      >
        <h2 id="lab-night" className="font-display text-display-sm font-medium text-ink">
          A <em>night</em> section
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          data-night flips the tokens; data-scene-night asks the stage to paint the Chamber behind it, up to its rounded
          edge, so 3D still shows through. Views inside use the night palette whatever the page theme.
        </p>
        <SceneView className="mt-6 aspect-[16/9] w-full" poster={<MarkPoster />} label="The Aperture Dome under night light">
          <SceneCamera position={[0, 0.02, 3.4]} fov={30} />
          <StudioLights />
          <ApertureDome3D size={1.4} />
          <LightParticles count={8000} size={16} />
        </SceneView>
      </section>
    </main>
  );
}
