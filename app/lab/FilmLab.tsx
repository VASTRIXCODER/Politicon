'use client';

import { useEffect, useId, useState } from 'react';
import Button from '@/components/ui/Button';
import Surface from '@/components/ui/Surface';
import SceneView from '@/components/three/SceneView';
import HeroCapitol from '@/components/three/scenes/HeroCapitol.lazy';
import LandingFilm from '@/components/three/scenes/LandingFilm.lazy';
import { HouseholdDiorama, LedgerColumn, Plinth, SceneCamera, StudioLights } from '@/components/three/kit/lazy';
import { FILM_LEDGER_AMOUNTS, FILM_LEDGER_SCALE, STILL_PROGRESS, TIMELINE } from '@/components/three/scenes/filmShots';
import { FILM_SHOTS, filmStore, useFilmStore } from '@/lib/three/filmStore';
import { cn } from '@/lib/utils';

/*
 * /lab: the landing's 3D, for visual QA. The hero vignette, the film with a
 * scrubber (it drives filmStore exactly as the landing's scroll does), and
 * each shot as the still frame reduced motion shows.
 */

const SHOTS = [
  { title: 'The Capitol', note: 'Morning paper light, a slow dolly-in; the beam and glint at the lantern continue the hero.' },
  { title: 'A bill lifts off', note: 'The glass bill rises out of the lantern and glides toward the camera, turning to face it; the gold seal catches the light.' },
  { title: 'Light to the house', note: 'The sheet dissolves top first into light that streams over and down into the household; its windows warm.' },
  { title: 'The ledger', note: 'The light rises into the ledger: gains up from the baseline in teal, costs down in amber, then the net ring (example: +$1,240/yr).' },
  { title: 'Dusk', note: 'Back and up into twilight and night: lamplit windows, a moonlit rim, some of the light out again as fireflies.' },
] as const;

/** Seconds for one pass of the film when playing. */
const PASS_SECONDS = 24;

function FramePoster({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 flex items-end rounded-tile bg-[radial-gradient(120%_90%_at_50%_100%,rgb(var(--c-glow)/0.18),transparent_70%)] p-4">
      <span className="font-mono-data text-xs text-muted">{label}</span>
    </div>
  );
}

function Scrubber() {
  const id = useId();
  const progress = useFilmStore((s) => s.progress);
  const shot = useFilmStore((s) => s.shot);
  const [playing, setPlaying] = useState(false);

  // The film section is "on screen" for as long as the lab shows it.
  useEffect(() => {
    filmStore.set({ active: true });
    return () => filmStore.reset();
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const p = filmStore.get().progress + (now - last) / 1000 / PASS_SECONDS;
      last = now;
      filmStore.set({ progress: p > 1 ? 0 : p });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" aria-pressed={playing} onClick={() => setPlaying((v) => !v)}>
          {playing ? 'Pause' : 'Play'}
        </Button>
        <p className="text-sm text-muted" aria-live="polite">
          Shot <span className="font-mono-data text-ink">{shot + 1}</span> of {FILM_SHOTS}: {SHOTS[shot].title}
        </p>
      </div>
      <label htmlFor={id} className="flex items-center gap-3 text-sm text-muted">
        Progress
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => {
            setPlaying(false);
            filmStore.set({ progress: Number(e.target.value) });
          }}
          className="w-full accent-primary"
        />
        <span className="w-12 text-right font-mono-data text-ink">{progress.toFixed(3)}</span>
      </label>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        Jump to a still:
        {STILL_PROGRESS.map((p, i) => (
          <button
            key={p}
            type="button"
            className="font-mono-data text-primary-300 underline underline-offset-4"
            onClick={() => {
              setPlaying(false);
              filmStore.set({ progress: p });
            }}
          >
            {i + 1} ({p})
          </button>
        ))}
      </p>
    </div>
  );
}

export default function FilmLab() {
  return (
    <section className="mt-16" aria-labelledby="lab-film">
      <h2 id="lab-film" className="font-display text-display-sm font-medium text-ink">
        The landing <em>film</em>
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        &ldquo;From the Capitol to your kitchen table&rdquo;: one scene, played by filmStore progress (0 → 1, five equal
        shots), damped so scroll jitter never jerks the camera. The bill dissolves from {TIMELINE.stream.start} to{' '}
        {TIMELINE.stream.end}; dusk falls from {TIMELINE.dusk.start}.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
        <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
          <SceneView className="aspect-[5/4]" poster={<FramePoster label="Hero" />} label="The Capitol in porcelain on a paper plinth, in morning light">
            <HeroCapitol />
          </SceneView>
          <div>
            <h3 className="font-display text-lg font-medium text-ink">Hero vignette</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The establishing shot: plinth, motes, beam and glint, a slow idle orbit and a lean toward the mouse. Shot 1
              opens on the same view.
            </p>
          </div>
        </Surface>

        <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-4">
          <SceneView className="aspect-[4/5] sm:aspect-[16/9]" poster={<FramePoster label="Film" />} label="The landing film, at the progress set below">
            <LandingFilm />
          </SceneView>
          <Scrubber />
        </Surface>
      </div>

      <h3 className="mt-10 font-display text-xl font-medium text-ink">New kit pieces</h3>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
          <SceneView className="aspect-square" poster={<FramePoster label="Household" />} label="A household diorama: a porcelain house, two figures, a car and a tree on a plinth">
            <SceneCamera position={[-2.2, 1.7, 3.4]} target={[-0.1, 0.25, 0]} fov={30} />
            <StudioLights />
            <HouseholdDiorama glow={0.6} />
          </SceneView>
          <div>
            <h4 className="font-display text-lg font-medium text-ink">Household diorama</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted">An architect&apos;s model: porcelain, a violet door, lamplight in the windows (glow 0.6 here).</p>
          </div>
        </Surface>
        <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
          <SceneView className="aspect-square" poster={<FramePoster label="Ledger" />} label="A ledger column: two teal gain slabs above a baseline, two amber cost slabs below, and a ring at the net">
            <SceneCamera position={[1.1, 0.95, 2.9]} target={[0, 0.55, 0]} fov={30} />
            <StudioLights />
            <LedgerColumn amounts={FILM_LEDGER_AMOUNTS} unitsPerDollar={FILM_LEDGER_SCALE} />
          </SceneView>
          <div>
            <h4 className="font-display text-lg font-medium text-ink">Ledger column</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              The film&apos;s example: +$1,600 and +$420 up in teal, −$520 and −$260 down in amber, the ring at +$1,240. Heights
              are linear in dollars.
            </p>
          </div>
        </Surface>
        <Surface as="article" variant="outline" pad="sm" className="flex flex-col gap-3">
          <SceneView className="aspect-square" poster={<FramePoster label="Plinth" />} label="A paper plinth with a violet inlay">
            <SceneCamera position={[0, 1.4, 3.6]} target={[0, -0.05, 0]} fov={30} />
            <StudioLights />
            <Plinth radius={1} height={0.2} />
          </SceneView>
          <div>
            <h4 className="font-display text-lg font-medium text-ink">Plinth</h4>
            <p className="mt-1 text-sm leading-relaxed text-muted">The paper base every diorama stands on, with its blob shadow.</p>
          </div>
        </Surface>
      </div>

      <h3 className="mt-10 font-display text-xl font-medium text-ink">Stills (reduced motion)</h3>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SHOTS.map((s, i) => (
          <Surface key={s.title} as="article" variant="outline" pad="sm" className={cn('flex flex-col gap-3', i === 4 && 'sm:col-span-2 lg:col-span-1')}>
            <SceneView className="aspect-[16/10]" poster={<FramePoster label={`Shot ${i + 1}`} />} label={`Shot ${i + 1}: ${s.title}`}>
              <LandingFilm quality="still" stillShot={i} />
            </SceneView>
            <div>
              <h4 className="font-display text-lg font-medium text-ink">
                {i + 1}. {s.title}
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.note}</p>
            </div>
          </Surface>
        ))}
      </div>
    </section>
  );
}
