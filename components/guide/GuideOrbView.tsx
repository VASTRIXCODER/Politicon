'use client';

import SceneView from '@/components/three/SceneView';
import GuideOrb from '@/components/three/scenes/GuideOrb.lazy';
import OrbPoster from '@/components/guide/OrbPoster';
import type { OrbState } from '@/components/guide/orbVoice';

/**
 * The Policy Guide's orb on the page: the 3D orb on the shared stage where
 * 3D runs, its CSS poster everywhere else (and until the scene has drawn).
 * Size it with className (a square: size-16, size-24…). Decorative: the
 * conversation's state is told in the DOM, by the log's typing indicator.
 *
 *   const voice = useOrbVoice(isTyping);
 *   <GuideOrbView className="size-20" state={voice.state} pulse={voice.pulse} />
 */
export default function GuideOrbView({ state, pulse, className, eager = true }: { state: OrbState; pulse: number; className?: string; eager?: boolean }) {
  return (
    <SceneView className={className} eager={eager} poster={<OrbPoster state={state} pulse={pulse} />}>
      <GuideOrb state={state} pulse={pulse} />
    </SceneView>
  );
}
