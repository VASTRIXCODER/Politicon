import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import Surface from '@/components/ui/Surface';
import { CITY } from '@/components/three/scenes/bracketCityData';
import { BRACKETS, CATEGORIES, EXAMPLE_COUNT_LABEL, EXAMPLE_POLICIES } from '@/lib/explorerData';
import ExplorerClient from './ExplorerClient';
import CityLegend from './_components/CityLegend';
import CityPoster from './_components/CityPoster';
import ExplorerCta from './_components/ExplorerCta';
import IllustrativeNote from './_components/IllustrativeNote';
import NightSkyline from './_components/NightSkyline';
import PolicyDocket from './_components/PolicyDocket';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Public Impact Explorer',
  description:
    'Illustrative examples of how different kinds of policy can cost or save households in each income bracket. No login required.',
};

/*
 * /explorer: the illustrative dataset as "brackets as a city". An editorial
 * header that says plainly what the data is, the city itself with its
 * controls and readout (ExplorerClient, over a poster drawn here on the
 * server), every figure as bars or a table, the example policies behind
 * them, what the examples are and aren't, and the way to a real estimate.
 */

/** Facts about the dataset itself, not about anyone's use of it. */
const FACTS = [
  { value: String(BRACKETS.length), label: 'income brackets', note: 'one district each' },
  { value: String(CATEGORIES.length), label: 'policy categories', note: 'one tower each' },
  { value: String(EXAMPLE_POLICIES.length), label: 'example policies', note: 'all hypothetical' },
  { value: `$${CITY.floorDollars}`, label: 'a year per floor', note: 'one linear scale' },
];

const ABOUT = [
  {
    title: 'Hypothetical policies, not real bills',
    body: 'Each example is a kind of policy that comes up from across the political spectrum. None is a real bill, and none quotes a real rate, threshold or amount.',
  },
  {
    title: 'Made-up round numbers',
    body: 'The dollar figures are invented to show the idea: the same policy can help some households and cost others, and every bracket gains in some categories and pays in others.',
  },
  {
    title: 'A typical household per bracket',
    body: 'Each amount is for a typical household in the bracket, averaged over the households a policy reaches and the ones it doesn’t, in dollars a year.',
  },
  {
    title: 'Signed from the household’s side',
    body: '+ is a gain (lower taxes, a benefit, higher pay); − is a cost (taxes, prices, premiums). Gains are teal, costs amber, and both always carry a sign and a word.',
  },
];

export default function ExplorerPage() {
  // State bills are only fetched when Open States is configured.
  const stateBills = Boolean(process.env.OPENSTATES_API_KEY);

  return (
    <div className="relative min-h-screen">
      <AmbientBackground animated />
      <div className="relative z-10">
        <Navbar />
        <main id="main" tabIndex={-1} className="overflow-x-clip pb-24 pt-28 sm:pt-36">
          {/* Header: the copy, and beside it the dataset's facts as a ledger. */}
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:items-end lg:gap-12 lg:px-8">
            <div className="lg:col-span-7">
              <PageHeader
                eyebrow="The explorer · No login required"
                title={
                  <>
                    Public Impact <em>Explorer</em>
                  </>
                }
                lede={
                  <p>
                    The same policy can help one household and cost another. Explore how {EXAMPLE_COUNT_LABEL} could add
                    up for a typical household in each income bracket. The policies are hypothetical and the dollar figures
                    are made up to show the idea.
                  </p>
                }
              />
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Badge variant="example" size="md">
                  Illustrative
                </Badge>
                <IllustrativeNote />
              </div>
            </div>

            <dl className="grid grid-cols-2 border-y border-fg/10 lg:col-span-5">
              {FACTS.map((f, i) => (
                <div
                  key={f.label}
                  className={cn(
                    'flex flex-col gap-1 py-5 sm:py-6',
                    i % 2 === 1 ? 'border-l border-fg/10 pl-5 sm:pl-6' : 'pr-5 sm:pr-6',
                    i >= 2 && 'border-t border-fg/10'
                  )}
                >
                  <dt className="text-sm text-ink">
                    {f.label}
                    <span className="mt-0.5 block text-meta text-muted">{f.note}</span>
                  </dt>
                  <dd className="order-first font-display text-display-sm font-medium text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The city, its controls and readout, then every figure. */}
          <div className="mt-16 sm:mt-24">
            <ExplorerClient poster={<CityPoster />} legend={<CityLegend />} />
          </div>

          {/* The policies behind the city */}
          <section aria-labelledby="example-policies-heading" className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-muted">The docket</p>
              <h2 id="example-policies-heading" className="mt-4 font-display text-display-sm font-medium text-ink [text-wrap:balance]">
                The {EXAMPLE_POLICIES.length} example policies <em>behind the city</em>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-muted">
                Each card shows how one policy spreads across the brackets, every card on the same scale, and the bracket it
                affects most. Amounts are $ per year from the household&rsquo;s side: + is a gain, − is a cost.
              </p>
            </div>
            <div className="mt-10">
              <PolicyDocket />
            </div>
          </section>

          {/* What the examples are, and aren't */}
          <section aria-labelledby="about-examples-heading" className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="font-mono-data text-meta uppercase tracking-[0.18em] text-muted">About this data</p>
                <h2 id="about-examples-heading" className="mt-4 font-display text-display-sm font-medium text-ink [text-wrap:balance]">
                  What these examples <em>are</em>, and aren&rsquo;t
                </h2>
                <IllustrativeNote className="mt-6" />
              </div>
              <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
                {ABOUT.map((item, i) => (
                  <li key={item.title} className="border-t border-fg/10 pt-5">
                    <p className="font-mono-data text-meta text-primary-300" aria-hidden="true">
                      {String(i + 1).padStart(2, '0')}
                    </p>
                    <h3 className="mt-2 text-base font-medium text-ink">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* The way to a real estimate (auth-aware; the signed-out version renders on the server). */}
          <div className="mx-auto mt-24 max-w-7xl px-4 sm:mt-32 sm:px-6 lg:px-8">
            <Surface
              variant="night"
              as="section"
              aria-labelledby="explorer-cta-heading"
              radius="xl"
              pad="none"
              className="overflow-hidden px-6 pb-48 pt-16 text-center sm:px-12 sm:pb-56 sm:pt-24"
            >
              <ExplorerCta stateBills={stateBills} />
              <NightSkyline className="bottom-6 sm:bottom-10" />
            </Surface>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
