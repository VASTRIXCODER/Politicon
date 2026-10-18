import CapitolArt from './CapitolArt';

/**
 * The hero's poster: the Capitol in morning light, standing in for the 3D
 * vignette (components/three/scenes/HeroCapitol) until it draws, and
 * instead of it on tier 0. Server-rendered and decorative (aria-hidden): the
 * hero's meaning is its headline.
 *
 * The drawing sits on a pool of paper light with a faint horizon hairline,
 * so it reads as an object standing in space rather than a picture in a box.
 */
export default function HeroPoster() {
  return (
    <div
      aria-hidden="true"
      data-decorative=""
      // Feathered at every edge, so the drawing has no frame: it stands in the page's light.
      className="absolute inset-0 [mask-image:radial-gradient(ellipse_72%_70%_at_54%_46%,#000_58%,transparent_100%)]"
    >
      {/* Paper light pooled under the building, and a hairline horizon. */}
      <div className="absolute inset-x-[6%] bottom-[16%] h-[38%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(var(--c-raised)/0.9),rgb(var(--c-raised)/0)_100%)] dark:bg-[radial-gradient(closest-side,rgb(var(--c-violet)/0.16),transparent_100%)]" />
      <div className="absolute inset-x-0 bottom-[25%] h-px bg-gradient-to-r from-transparent via-fg/[0.12] to-transparent" />
      <CapitolArt className="relative" />
    </div>
  );
}
