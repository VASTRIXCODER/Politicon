import SceneView from '@/components/three/SceneView';
import HouseholdScene from '@/components/three/scenes/HouseholdScene.lazy';
import HouseholdPoster from '@/components/onboarding/HouseholdPoster';
import { describeHousehold, type HouseholdModel } from '@/lib/household';
import { cn } from '@/lib/utils';

/*
 * The person's household, small: the diorama they built in onboarding,
 * turning slowly on its plinth (a full turn in about 40 seconds), for the
 * dashboard header and anywhere else the app shows "you". On devices without
 * 3D, under reduced motion and before the scene draws, it is the same
 * household as a still drawing (HouseholdPoster). Screen readers hear it as
 * an image described in a sentence (describeHousehold).
 *
 *   <HouseholdAvatar model={householdFromProfile(profile)} size="md" />
 *
 * Square, and transparent: put it straight on the page or in a pane with no
 * fill (the 3D canvas sits behind the page). The stage loads with it, so
 * render it where a 3D scene is welcome.
 */

export type HouseholdAvatarSize = 'sm' | 'md' | 'lg';

const SIZES: Record<HouseholdAvatarSize, string> = {
  sm: 'w-[7.5rem]',
  md: 'w-40',
  lg: 'w-[12.5rem]',
};

export interface HouseholdAvatarProps {
  model: HouseholdModel;
  className?: string;
  /** sm 120px, md 160px (default), lg 200px across. */
  size?: HouseholdAvatarSize;
}

export default function HouseholdAvatar({ model, className, size = 'md' }: HouseholdAvatarProps) {
  return (
    <SceneView
      className={cn('aspect-square flex-shrink-0', SIZES[size], className)}
      poster={<HouseholdPoster model={model} compact />}
      label={`Your household: ${describeHousehold(model)}`}
    >
      <HouseholdScene model={model} mode="avatar" />
    </SceneView>
  );
}
