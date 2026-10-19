import { mixHex, type ScenePalette } from '@/lib/three/palette';

/*
 * The look the impact page's night vitrines share (TransmissionHero,
 * FlowSankey, VulnerabilityCrystal, SpendingTerrain), so their stands and
 * their server posters (components/impact/posters/draw.tsx PlinthArt, which
 * fills them with the night surface) are one design: a raised-night plinth,
 * quieter than the data on it, never the bright lilac paper.
 */

/** The plinth's colour in a vitrine: raised night by night; by day the kit's own default. */
export function vitrinePlinth(p: ScenePalette): string | undefined {
  return p.night ? mixHex(p.surface, p.violet, 0.08) : undefined;
}

/** A porcelain foot or zero shelf: porcelain by day, a lit raised night with a breath of violet by night. */
export function vitrineStand(p: ScenePalette): string {
  return p.night ? mixHex(p.surface, p.violetLight, 0.22) : mixHex(p.porcelain, p.violet, 0.06);
}
