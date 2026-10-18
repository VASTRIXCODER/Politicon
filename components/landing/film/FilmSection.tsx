import KineticHeadline from '@/components/landing/KineticHeadline';
import FilmCaption, { FilmTranscript } from './FilmCaption';
import FilmPlayer from './FilmPlayer';
import FilmPoster, { isNightShot } from './FilmPosters';
import { buildFilmShots } from './shots';

interface FilmSectionProps {
  /** True when state bills are loaded (Open States is configured). */
  stateBills: boolean;
}

/** What the 3D film shows, for screen readers (the captions carry the details). */
const SCENE_LABEL =
  'A short film: a bill lifts off the Capitol as a sheet of light, streams into a household, and resolves into an example dollar figure at dusk.';

/**
 * "How it works", told as the path of one bill: from the Capitol to your
 * kitchen table in five shots (signature experience #1 of the redesign).
 *
 * Server-rendered as a complete, static five-panel sequence (each panel a
 * drawn still and its caption), which is what reduced motion, tier-0
 * devices and every visitor before hydration see. FilmPlayer upgrades it to
 * the pinned, scroll-driven 3D film in the browser when it can.
 */
export default function FilmSection({ stateBills }: FilmSectionProps) {
  const shots = buildFilmShots(stateBills);
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      data-scene-section="film"
      className="relative overflow-x-clip"
    >
      <header className="mx-auto grid max-w-7xl gap-6 px-4 pb-14 pt-24 sm:px-6 sm:pb-16 sm:pt-32 lg:grid-cols-12 lg:items-end lg:gap-12 lg:px-8 lg:pb-24">
        <div className="lg:col-span-7">
          <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
            How it works
          </p>
          <KineticHeadline id="how-it-works-heading" className="mt-5 font-display text-display-md font-medium text-ink">
            From the Capitol <em>to your kitchen table.</em>
          </KineticHeadline>
        </div>
        <p className="max-w-md text-lg leading-relaxed text-muted lg:col-span-5 lg:justify-self-end">
          One bill, five steps: how an official record becomes a plain-English estimate for your household.
          Educational and non-partisan, start to finish.
        </p>
      </header>

      <FilmPlayer
        captions={shots.map((shot, i) => (
          <FilmCaption key={shot.id} shot={shot} index={i} />
        ))}
        transcripts={shots.map((shot, i) => (
          <FilmTranscript key={shot.id} shot={shot} index={i} />
        ))}
        posters={shots.map((shot) => (
          <FilmPoster key={shot.id} shot={shot.id} />
        ))}
        labels={shots.map((shot) => shot.label)}
        numerals={shots.map((shot) => shot.numeral)}
        nightShot={shots.findIndex((shot) => isNightShot(shot.id))}
        sceneLabel={SCENE_LABEL}
        endId="how-it-works-end"
      />
    </section>
  );
}
