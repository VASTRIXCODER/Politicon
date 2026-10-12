/**
 * Product analytics events, sent to Vercel Web Analytics through the
 * first-party script that components/Analytics.tsx loads (window.va). When
 * that script isn't on the page (local development, tests, self-hosting, or
 * NEXT_PUBLIC_ANALYTICS_DISABLED=1) track() does nothing.
 *
 * Privacy rule: an event says THAT something happened, never anything about
 * the person or their money. Names are a fixed list, and properties are a
 * fixed set of keys whose values each come from a fixed list. Income,
 * dollar amounts, profile answers, policy titles or text, email addresses and
 * free text can't be expressed, and anything else passed at runtime is
 * dropped before it leaves the browser.
 */

export const TRACK_EVENTS = [
  'signup_completed',
  'onboarding_completed',
  'feed_refreshed',
  'analysis_requested',
  'analysis_ready',
  'guide_message_sent',
  'policy_dismissed',
  'feedback_sent',
] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];

/**
 * Policy categories the feed uses (the enum in lib/server/aiSchemas.ts, which
 * is server-only; tests/track.test.ts keeps the two lists in step).
 */
export const POLICY_CATEGORIES = [
  'taxes', 'healthcare', 'housing', 'employment', 'education', 'retirement',
  'energy', 'trade', 'transportation', 'consumer', 'other',
] as const;
export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

/** Every property an event may carry, with every value it may take. */
export const TRACK_PROPS = {
  /** Where in the app it happened (or, for guide messages, what started it). */
  source: ['dashboard', 'policies', 'impact', 'advisor', 'chat', 'policy'],
  category: POLICY_CATEGORIES,
  status: ['ok', 'error', 'fresh', 'cached', 'guardrail', 'confirmed', 'pending_confirmation'],
  reading_mode: ['simple', 'expert'],
  /** What a piece of feedback was about, and the rating given (never the reason text). */
  target: ['analysis', 'feed_item', 'chat_reply', 'insight'],
  rating: ['up', 'down', 'not_relevant', 'report'],
} as const satisfies Record<string, readonly string[]>;

export type TrackPropKey = keyof typeof TRACK_PROPS;
export type TrackProps = { [K in TrackPropKey]?: (typeof TRACK_PROPS)[K][number] };

const isEvent = (name: unknown): name is TrackEvent =>
  typeof name === 'string' && (TRACK_EVENTS as readonly string[]).includes(name);

/**
 * Keep only allowlisted keys whose value is one of that key's allowed
 * values. Returns undefined when nothing is left.
 */
export function sanitizeTrackProps(props: unknown): TrackProps | undefined {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (!Object.prototype.hasOwnProperty.call(TRACK_PROPS, key)) continue;
    const allowed = TRACK_PROPS[key as TrackPropKey] as readonly string[];
    if (typeof value === 'string' && allowed.includes(value)) out[key] = value;
  }
  return Object.keys(out).length ? (out as TrackProps) : undefined;
}

/** A policy's category as an event property, or undefined if it isn't a known one. */
export function policyCategory(value: unknown): PolicyCategory | undefined {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (POLICY_CATEGORIES as readonly string[]).includes(v) ? (v as PolicyCategory) : undefined;
}

type VaQueue = (command: 'event', payload: { name: TrackEvent; data?: TrackProps }) => void;

/** Record one product event. Never throws, and does nothing on the server. */
export function track(name: TrackEvent, props?: TrackProps): void {
  if (typeof window === 'undefined' || !isEvent(name)) return;
  try {
    const data = sanitizeTrackProps(props);
    if (process.env.NODE_ENV === 'development') console.debug('[track]', name, data ?? {});
    const va = (window as unknown as { va?: VaQueue }).va;
    if (typeof va === 'function') va('event', data ? { name, data } : { name });
  } catch {
    /* analytics must never break the page */
  }
}
