import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { WORDMARK } from '@/lib/brand/mark';
import { SUPPORT_EMAIL } from '@/lib/legal';

const footerLinks = {
  Product: [
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'AI Policy Guide', href: '/advisor' },
    { label: 'My Impact', href: '/impact' },
  ],
  Support: [
    { label: 'Help & FAQ', href: '/help' },
    { label: 'Contact us', href: `mailto:${SUPPORT_EMAIL}` },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Disclaimer', href: '/disclaimer' },
  ],
};

/*
 * The giant wordmark is letterpress: glyphs a shade off the paper, with a
 * bright lip of light along their lower edge and a hairline of shadow along
 * the upper one, so they read as pressed in. At night the same mix turns them
 * a shade lighter than the night, lit from above and glowing faintly violet:
 * raised instead of pressed. A beam of violet light crosses them.
 *
 * The tone is a color-mix() of the theme tokens. Where that isn't supported,
 * the word falls back to a flat faint tint without the relief (a value with
 * var() in it can't fall back declaration by declaration, hence @supports).
 * Decorative only (aria-hidden): the logo above names the site.
 */
// (Spelled out in full: Tailwind only generates class names it finds whole in the source.)
const RELIEF = [
  'text-fg/[0.07]',
  'supports-[color:color-mix(in_oklab,red,red)]:[color:color-mix(in_oklab,rgb(var(--c-canvas))_92%,rgb(var(--c-fg)))]',
  'supports-[color:color-mix(in_oklab,red,red)]:[text-shadow:0_2px_0_rgb(255_255_255/0.85),0_-1px_0_rgb(var(--c-fg)/0.08)]',
  'dark:supports-[color:color-mix(in_oklab,red,red)]:[text-shadow:0_-1px_0_rgb(255_255_255/0.08),0_3px_0_rgb(0_0_0/0.5),0_24px_60px_rgb(var(--c-violet)/0.2)]',
].join(' ');

// The beam: the word again on top, clipped to a soft diagonal of violet light.
const BEAM = [
  'absolute inset-0 bg-clip-text text-transparent [-webkit-text-fill-color:transparent]',
  'bg-[linear-gradient(105deg,transparent_24%,rgb(var(--c-violet)/0.14)_42%,rgb(var(--c-glow)/0.26)_50%,rgb(var(--c-violet)/0.1)_58%,transparent_76%)]',
].join(' ');

const WORDMARK_TYPE = 'block whitespace-nowrap text-center font-display font-semibold leading-[0.8] tracking-[-0.045em]';

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-fg/8 bg-canvas">
      {/* A rim of violet light along the top edge of the paper. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />
      {/* Soft light pooling behind the wordmark. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(ellipse_60%_55%_at_50%_100%,rgb(var(--c-violet)/0.07),transparent_70%)] dark:bg-[radial-gradient(ellipse_60%_55%_at_50%_100%,rgb(var(--c-violet)/0.2),transparent_70%)]"
      />

      <div className="relative mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-20 lg:px-8">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-4 lg:grid-cols-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-5">
            <Logo size="md" className="mb-6 flex w-fit" />
            <p className="font-display text-display-sm text-ink">
              Real bills, <em>in plain numbers.</em>
            </p>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
              Non-partisan AI that translates government policies into your personal dollar impact. Not political opinion — just the answer.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links], i) => (
            <div key={group} className={i === 0 ? 'lg:col-span-2 lg:col-start-7' : 'lg:col-span-2'}>
              <h2 className="mb-5 font-mono-data text-meta font-medium uppercase tracking-[0.16em] text-muted">{group}</h2>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="rounded text-sm text-ink/85 decoration-primary/60 underline-offset-4 transition-colors duration-200 ease-civic hover:text-ink hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-fg/8 pt-6 text-meta text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Politicon. All rights reserved.</p>
          <p>Impact figures are educational estimates, not financial, tax or legal advice.</p>
        </div>
      </div>

      {/*
        The giant wordmark, bleeding off the bottom of the page. Its size is set
        on the clipping box, so the em paddings are of the wordmark. Fraunces sets
        "Politicon" about 4em wide at this tracking: 21vw leaves room on a 375px
        phone, and the box clips it on any screen.
      */}
      <div
        aria-hidden="true"
        data-decorative
        className="relative mt-10 select-none overflow-hidden px-2 pt-[0.06em] text-[clamp(4rem,21vw,20rem)] sm:mt-14"
      >
        <div className="relative -mb-[0.08em]">
          <span className={`${WORDMARK_TYPE} ${RELIEF}`}>{WORDMARK}</span>
          <span className={`${WORDMARK_TYPE} ${BEAM}`}>{WORDMARK}</span>
        </div>
      </div>
    </footer>
  );
}
