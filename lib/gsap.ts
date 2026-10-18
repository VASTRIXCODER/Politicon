/**
 * GSAP for the marketing pages, loaded only when something asks for it.
 *
 *   const { gsap, SplitText } = await loadSplitText();
 *
 * Every entry point here is a dynamic import(), so GSAP never reaches a
 * page's first-load JavaScript: it downloads the first time a kinetic
 * headline (components/landing/KineticHeadline.tsx) or a scroll-driven
 * scene needs it, and only in browsers where motion is allowed (callers
 * check prefers-reduced-motion before they call). Each loader is memoised,
 * and a failed download is forgotten so the next caller can try again.
 *
 * Smooth scrolling: Lenis (components/providers/LenisProvider.tsx) runs the
 * page's one animation-frame loop with autoRaf off, so GSAP's ticker must
 * not drive lenis.raf as well (the Lenis docs' recipe for apps without their
 * own loop); that would step the scroll twice a frame. loadScrollTrigger()
 * only feeds Lenis's scroll events to ScrollTrigger.update, following
 * whichever Lenis instance is live (none on app pages or under reduced
 * motion, when ScrollTrigger reads the native scroll as usual).
 */
import { onLenisChange } from '@/components/providers/LenisProvider';

type Gsap = typeof import('gsap').gsap;
type SplitTextClass = typeof import('gsap/SplitText').SplitText;
type ScrollTriggerClass = typeof import('gsap/ScrollTrigger').ScrollTrigger;

/** Memoises a loader; a rejected load is dropped so a later call retries. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };
}

/** GSAP's core. */
export const loadGsap = once<Gsap>(() => import('gsap').then((m) => m.gsap));

/** GSAP with SplitText registered (line, word and character splits with masks). */
export const loadSplitText = once<{ gsap: Gsap; SplitText: SplitTextClass }>(async () => {
  const [gsap, { SplitText }] = await Promise.all([loadGsap(), import('gsap/SplitText')]);
  gsap.registerPlugin(SplitText);
  return { gsap, SplitText };
});

/**
 * GSAP with ScrollTrigger registered and kept in step with Lenis: each Lenis
 * scroll event updates every trigger in the same frame, and a new or
 * destroyed instance (a route change, a reduced-motion switch) is picked up.
 */
export const loadScrollTrigger = once<{ gsap: Gsap; ScrollTrigger: ScrollTriggerClass }>(async () => {
  const [gsap, { ScrollTrigger }] = await Promise.all([loadGsap(), import('gsap/ScrollTrigger')]);
  gsap.registerPlugin(ScrollTrigger);
  let detach: (() => void) | null = null;
  onLenisChange((lenis) => {
    detach?.();
    detach = lenis ? lenis.on('scroll', ScrollTrigger.update) : null;
    ScrollTrigger.refresh();
  });
  return { gsap, ScrollTrigger };
});
