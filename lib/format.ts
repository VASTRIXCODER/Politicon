/**
 * Number formatting used across the app. Losses always carry a minus sign
 * (the typographic "−", which screen readers announce as "minus"), so the
 * direction of an impact never depends on colour alone.
 */
const MINUS = '−';

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** The sign to print before an amount: "−" for losses, "+" for gains when signed. */
export function signPrefix(n: number, signed = true): string {
  return sign(clean(n), signed);
}

function sign(n: number, signed: boolean): string {
  if (n < 0) return MINUS;
  if (n > 0 && signed) return '+';
  return '';
}

/** Treats NaN/Infinity as 0 and rounds away float noise like -0.0001. */
function clean(n: number, digits = 0): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function compactAbs(a: number): string {
  if (a >= 1e9) return `${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${trim(a / 1e3)}K`;
  return whole.format(a);
}
/** toFixed without trailing zeros: 1.50 → "1.5", 2.00 → "2". */
const fixed = (x: number, digits: number) => x.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
const trim = (x: number) => (x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, ''));

/**
 * Dollars: formatUSD(-1234) → "−$1,234"; with { signed: true } gains get a
 * "+" too; { compact: true } → "−$1.2K"; { suffix: '/yr' } is appended.
 */
export function formatUSD(n: number, opts: { signed?: boolean; compact?: boolean; suffix?: string } = {}): string {
  const v = clean(n);
  const a = Math.abs(v);
  const body = opts.compact ? compactAbs(a) : whole.format(a);
  return `${sign(v, !!opts.signed)}$${body}${opts.suffix ?? ''}`;
}

/** Percent: formatPct(1.25) → "+1.3%" (signed by default). */
export function formatPct(n: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const digits = opts.digits ?? 1;
  const v = clean(n, digits);
  return `${sign(v, opts.signed ?? true)}${fixed(Math.abs(v), digits)}%`;
}

/** Percentage points, for changes in a rate: formatPts(-0.5) → "−0.5 pts". */
export function formatPts(n: number, opts: { digits?: number } = {}): string {
  const digits = opts.digits ?? 1;
  const v = clean(n, digits);
  return `${sign(v, true)}${fixed(Math.abs(v), digits)} pts`;
}

export type ImpactSign = 'gain' | 'loss' | 'neutral';

/** Whether an amount is a gain, a loss or (after rounding to whole dollars) nothing. */
export function impactSign(n: number): ImpactSign {
  const v = clean(n);
  return v > 0 ? 'gain' : v < 0 ? 'loss' : 'neutral';
}

/**
 * Words that state the direction in text: "saves you" / "costs you" for
 * budget effects, "you gain" / "you lose" for money coming in (pay, benefits),
 * "no change" either way.
 */
export function impactWords(n: number, kind: 'budget' | 'income' = 'budget'): string {
  const s = impactSign(n);
  if (s === 'neutral') return 'no change';
  if (kind === 'income') return s === 'gain' ? 'you gain' : 'you lose';
  return s === 'gain' ? 'saves you' : 'costs you';
}

/**
 * A change to something the user pays (tax, rent, premiums), given the
 * user-side signed amount: costChange(50) → "$50 lower", costChange(-50) →
 * "$50 higher", so a cost label never sits next to a sign that reads backwards.
 */
export function costChange(n: number, suffix = ''): string {
  const s = impactSign(n);
  if (s === 'neutral') return 'No change';
  return `${formatUSD(Math.abs(n), { suffix })} ${s === 'gain' ? 'lower' : 'higher'}`;
}

/**
 * Chart axis ticks: compact dollars, keeping cents below $10 so fractional
 * ticks on small ranges ($0.50, $1.50) don't round to the same label.
 */
export function formatAxisUSD(n: number): string {
  if (Number.isFinite(n) && Math.abs(n) < 10 && !Number.isInteger(n)) {
    const v = clean(n, 2);
    return `${sign(v, false)}$${Math.abs(v).toFixed(2)}`;
  }
  return formatUSD(n, { compact: true });
}

/** Tailwind text colour for a signed amount. */
export function impactTone(n: number): string {
  const s = impactSign(n);
  return s === 'gain' ? 'text-emerald-400' : s === 'loss' ? 'text-red-400' : 'text-text-muted';
}
