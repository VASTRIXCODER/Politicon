'use client';

import { useRef, type ReactNode } from 'react';
import SceneView from '@/components/three/SceneView';
import LandingFilm from '@/components/three/scenes/LandingFilm.lazy';
import BillRecord from './BillRecord';

/** The shot whose still shows the bill at rest, with its official record. */
const RECORD_SHOT = 1;

/**
 * One composed frame of the 3D film, for a panel of the static sequence
 * when the visitor asked for reduced motion on a device that runs the 3D
 * stage: the real scene, standing still. Loaded on demand by FilmPlayer;
 * the drawn still (`poster`) shows until the frame is ready. Five of these
 * share the page, so each lets go of its scene once it is well off screen
 * (its drawing comes back) rather than keeping five films in GPU memory.
 */
export default function FilmStill({ shot, poster }: { shot: number; poster: ReactNode }) {
  const record = useRef<HTMLDivElement>(null);
  const withRecord = shot === RECORD_SHOT;
  return (
    <>
      <SceneView release className="absolute inset-0" poster={poster}>
        <LandingFilm quality="still" stillShot={shot} record={withRecord ? record : undefined} />
      </SceneView>
      {withRecord && <BillRecord ref={record} />}
    </>
  );
}
