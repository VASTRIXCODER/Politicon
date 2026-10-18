import Form from 'next/form';
import { ArrowRight, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import ImpactCard from './hero/ImpactCard';
import HeroPoster from './hero/HeroPoster';
import HeroVisual from './hero/HeroVisual';
import { buildImpactExamples } from './hero/impactExamples';

/** Longest question the hero hands to the AI Policy Guide (the guide caps it too). */
const MAX_QUESTION = 500;

/** The id of the empty marker at the end of the hero's HTML. */
export const HERO_END = 'hero-end';

interface HeroSectionProps {
  /** True when state bills are loaded (Open States is configured), so the hero may say so. */
  stateBills: boolean;
}

/**
 * The landing hero: the headline, the Policy Guide search and the two ways
 * in on the left; the Capitol in violet light behind the example receipt on
 * the right. On phones the Capitol is a band at the top of the first screen,
 * above the headline, and the receipt follows the copy (the reading order
 * is the same everywhere: the band is decoration).
 *
 * A server component, shown at once: the headline is the page's LCP element,
 * so nothing here fades or slides in. The client islands are small: the
 * search form (next/form, which works before hydration too), the buttons,
 * the receipt's carousel, and HeroVisual, which swaps the drawn Capitol for
 * the 3D one on devices that run it.
 */
export default function HeroSection({ stateBills }: HeroSectionProps) {
  // Where the data comes from; no counts that nothing measures. Archive gold
  // marks the two official sources (the record), and nothing else.
  const sources = [
    { name: 'Congress.gov', detail: 'Federal bill records', record: true },
    ...(stateBills ? [{ name: 'Open States', detail: 'All 50 state legislatures', record: true }] : []),
    { name: 'Free', detail: 'No credit card', record: false },
  ];

  return (
    <section
      aria-labelledby="hero-heading"
      data-scene-section="hero"
      className="relative overflow-x-clip pb-16 pt-[4.75rem] sm:pt-28 lg:flex lg:min-h-[100svh] lg:items-center lg:pb-20 lg:pt-28"
    >
      {/* Hold the first paint until the whole hero is parsed (Chromium; others
          ignore it), so it never shows the headline without the receipt or a
          half-drawn Capitol. React hoists this into the <head>; it costs only
          the parse of the hero's own markup. */}
      <link rel="expect" href={`#${HERO_END}`} blocking="render" />
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-y-5 px-4 sm:gap-y-6 sm:px-6 lg:grid-cols-12 lg:gap-x-10 lg:px-8">
        {/* ---- Copy ---- */}
        <div className="relative z-content lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <p className="flex items-center gap-3 font-mono-data text-meta uppercase tracking-[0.18em] text-muted">
            <span aria-hidden="true" className="h-px w-8 bg-gradient-to-r from-transparent to-primary/70" />
            {/* One line on a phone too: the short form there. */}
            <span className="whitespace-nowrap [hyphens:none]">
              AI Policy Guide · <span className="sm:hidden">Non-partisan</span>
              <span className="hidden sm:inline">Educational, non-partisan</span>
            </span>
          </p>

          {/* The accent line in italic violet, as in every headline. */}
          <h1 id="hero-heading" className="mt-5 font-display text-display-lg font-medium text-ink sm:mt-6">
            <span className="sm:block">Your money.</span> <span className="sm:block">Real bills.</span>{' '}
            <em className="sm:block">Crystal clear.</em>
          </h1>

          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted sm:mt-6">
            Not political opinion: a plain-English estimate, in dollars, of what a real bill could cost or save you
            {/* The short form on phones keeps the first screen to the point. */}
            <span className="hidden sm:inline">, personalized to your income range, location and life situation</span>.
          </p>

          {/* Search: hands the question to the AI Policy Guide, which fills it in
              without sending it. Signed-out visitors sign in first and come back. */}
          <Form action="/advisor" prefetch={false} role="search" className="mt-6 max-w-xl sm:mt-8">
            <label htmlFor="hero-policy-search" className="sr-only">
              Ask about a policy
            </label>
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-5 h-4 w-4 text-muted" aria-hidden="true" />
              <input
                id="hero-policy-search"
                name="q"
                type="text"
                required
                maxLength={MAX_QUESTION}
                enterKeyHint="go"
                autoComplete="off"
                placeholder="Ask about a policy, e.g. “minimum wage”"
                aria-describedby="hero-search-hint"
                className="input-glass w-full !rounded-full py-4 pl-12 pr-28 text-sm shadow-[0_18px_40px_-24px_rgb(var(--c-violet)/0.45)]"
              />
              <Button
                type="submit"
                size="sm"
                icon={<ArrowRight className="h-3.5 w-3.5" />}
                iconPosition="end"
                className="absolute right-2 gap-1.5"
              >
                Ask
              </Button>
            </div>
            <p id="hero-search-hint" className="mt-2.5 pl-5 text-meta text-muted">
              Opens the AI Policy Guide with your question ready to send. Free account required.
            </p>
          </Form>

          <div className="mt-5 flex flex-wrap gap-3 sm:mt-6">
            <Button href="/auth/signup" variant="primary" size="lg" icon={<ArrowRight className="h-4 w-4" />} iconPosition="end">
              Get My Impact Report
            </Button>
            <Button href="/explorer" variant="ghost" size="lg">
              Try the Explorer
            </Button>
          </div>
          <p className="mt-4 max-w-xl text-meta text-muted">
            Educational estimates, not financial, tax or legal advice. For adults 18+.
          </p>

          {/* Sources, as a quiet ledger line. */}
          <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-4 border-t border-fg/10 pt-6">
            {sources.map((source) => (
              <div key={source.name} className="flex flex-col-reverse gap-1">
                <dt className="text-meta text-muted">{source.detail}</dt>
                <dd className="flex items-center gap-2 font-mono-data text-sm font-medium text-ink">
                  {source.record && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold" />}
                  {source.name}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ---- The example receipt: after the copy on phones, in front of the Capitol from lg ---- */}
        {/* Before the Capitol in the HTML: the drawing is the heaviest markup in
            the hero, and a slow phone may paint the part of the page it has
            parsed so far. Its place on screen comes from the grid (and its
            z-index), so the order here changes nothing you see. */}
        <div className="relative lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-stretch">
          <div className="relative z-content mt-3 flex justify-center sm:mt-4 lg:absolute lg:bottom-[2%] lg:left-[-8%] lg:mt-0 lg:justify-start xl:left-[-4%]">
            <div className="w-full max-w-[360px] motion-safe:lg:animate-float">
              <ImpactCard
                examples={buildImpactExamples()}
                className="lg:[transform:perspective(1600px)_rotateY(9deg)_rotateX(4deg)]"
              />
            </div>
          </div>
          {/* Desktop: hold the column's height so the receipt has room below the dome. */}
          <div aria-hidden="true" className="hidden lg:block lg:h-[min(46rem,82svh)]" />
        </div>

        {/* ---- The Capitol: the top of a phone's first screen (order-first), behind the receipt from lg ---- */}
        {/* It bleeds to the screen's edges on phones and past the column on
            desktops (the section clips it), up to the top of the section
            there, so the lantern's beam rises out of view behind the
            navigation instead of stopping at an edge. No fill: the 3D stage
            draws behind the page. */}
        <div className="relative order-first -mx-4 h-[clamp(10.5rem,22svh,14rem)] sm:-mx-6 sm:h-[20rem] lg:order-none lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:mx-0 lg:h-auto lg:self-stretch">
          <div className="absolute inset-0 lg:-top-28 lg:bottom-0 lg:-left-[10%] lg:-right-[22%]">
            <HeroVisual poster={<HeroPoster />} />
          </div>
        </div>
      </div>
      {/* Where the hero's HTML ends: the render-blocking hint at the top waits for it. */}
      <span id={HERO_END} hidden />
    </section>
  );
}
