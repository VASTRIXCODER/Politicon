/**
 * The five shots of the landing film ("From the Capitol to your kitchen
 * table"), as words: what each caption says, in the order the 3D scene
 * (components/three/scenes/LandingFilm) plays them. The same copy is the
 * film's captions, the static five-panel version (reduced motion, no WebGL,
 * before hydration) and the progress rail, so all three always agree.
 *
 * Plain data, no React: tests/film.test.ts checks the honesty rules (the
 * example figure is labelled, the sign-up link reads differently from the
 * hero's, state coverage is claimed only when Open States is configured).
 */
import { formatUSD } from '@/lib/format';
import { FILM_LEDGER_EXAMPLE } from '@/components/three/scenes/filmShots';

/** A line of the example ledger in shot 4: a signed amount with the words that say which way it goes. */
export interface LedgerLine {
  /** "Saves you" / "Costs you" (never colour alone). */
  direction: string;
  /** What the line is, e.g. "lower premiums". */
  label: string;
  /** Signed dollars per year (+ saves, − costs). */
  amount: number;
}

export interface FilmShot {
  /** Stable key, also the poster id. */
  id: 'record' | 'plain-english' | 'household' | 'number' | 'decide';
  /** "01" … "05". */
  numeral: string;
  /** The rail's short label. */
  label: string;
  /** Mono kicker above the title. */
  kicker: string;
  /** Title, with the italic violet accent words split out. */
  title: { lead: string; accent: string };
  body: string;
  /** Short tags under the body (the record's sources, what the profile asks…). */
  tags?: { text: string; record?: boolean }[];
  /** Shot 4 only: the example ledger and its total. */
  example?: { lines: LedgerLine[]; total: number; totalWords: string; note: string };
  /** Shot 5 only: where to go next (worded unlike the hero's buttons). */
  links?: { href: string; text: string; primary?: boolean }[];
}

/**
 * The example in shot 4: the same lines the 3D ledger stacks
 * (components/three/scenes/filmShots.ts), so the caption and the scene
 * always agree. Illustrative, never a real analysis.
 */
export const EXAMPLE_LEDGER: LedgerLine[] = FILM_LEDGER_EXAMPLE.map(({ label, amount }) => ({
  direction: amount < 0 ? 'Costs you' : 'Saves you',
  label: label.toLowerCase(),
  amount,
}));
export const EXAMPLE_TOTAL = EXAMPLE_LEDGER.reduce((sum, line) => sum + line.amount, 0);

/** "+$1,240/yr", the way the caption and the 3D ledger print the example. */
export const EXAMPLE_TOTAL_TEXT = formatUSD(EXAMPLE_TOTAL, { signed: true, suffix: '/yr' });

/**
 * The official record printed on the glass bill in shot 2 (the 3D film pins
 * it to the sheet as DOM type; the drawn still repeats it). An example, and
 * labelled one: no real bill has this number. It is the same example policy
 * as the hero's receipt.
 */
export const BILL_RECORD = {
  kicker: 'Official record',
  number: 'H.R. ____',
  chamber: 'House',
  title: 'To extend health premium tax credits',
  status: 'In committee',
  introduced: 'Introduced Jan 2026',
} as const;

export function buildFilmShots(stateBills: boolean): FilmShot[] {
  return [
    {
      id: 'record',
      numeral: '01',
      label: 'The record',
      kicker: 'The official record',
      title: { lead: 'It starts with', accent: 'a real bill.' },
      body: stateBills
        ? 'We begin with bills in Congress, from Congress.gov, and in your state legislature, from Open States: the title, status and latest action, as the record has them. Anything the sources can’t confirm is marked unverified.'
        : 'We begin with bills in Congress, from Congress.gov: the title, status and latest action, as the record has them. Anything the source can’t confirm is marked unverified.',
      tags: [
        { text: 'Congress.gov', record: true },
        ...(stateBills ? [{ text: 'Open States', record: true }] : []),
        { text: 'Status & latest action' },
      ],
    },
    {
      id: 'plain-english',
      numeral: '02',
      label: 'Plain English',
      kicker: 'A bill in plain English',
      title: { lead: 'Legal text,', accent: 'in plain words.' },
      body: 'The AI Policy Guide reads the bill and explains what it would change: who it reaches, when it starts and what it costs. No jargon, and no spin.',
      tags: [{ text: 'What changes' }, { text: 'Who it reaches' }, { text: 'When it starts' }],
    },
    {
      id: 'household',
      numeral: '03',
      label: 'Your household',
      kicker: 'Mapped to your household',
      title: { lead: 'Then it meets', accent: 'your household.' },
      body: 'Your profile uses ranges, not exact figures: income range, location and life situation. Only those ranges, never your name or email, go to our AI provider, and you can export or delete your data anytime.',
      tags: [{ text: 'Income range' }, { text: 'Location' }, { text: 'Life situation' }],
    },
    {
      id: 'number',
      numeral: '04',
      label: 'Your number',
      kicker: 'Your number',
      title: { lead: 'It resolves into', accent: 'your number.' },
      body: 'A dollar estimate for your situation, with 1-, 3- and 5-year projections and the assumptions and confidence behind every figure. Savings carry a plus and costs a minus, always in words too.',
      example: {
        lines: EXAMPLE_LEDGER,
        total: EXAMPLE_TOTAL,
        totalWords: 'Could save you',
        note: 'Illustrative figures for a sample household, not a real analysis.',
      },
    },
    {
      id: 'decide',
      numeral: '05',
      label: 'You decide',
      kicker: 'Decide for yourself',
      title: { lead: 'And then,', accent: 'you decide.' },
      body: 'Politicon never tells you how to vote or what to think. It’s educational and non-partisan: estimates, not advice, with the trade-offs and the sources in plain view.',
      links: [
        { href: '/auth/signup', text: 'Start your free report', primary: true },
        { href: '/explorer', text: 'See example policies' },
      ],
    },
  ];
}
