/**
 * Messages answered with a fixed, reviewed reply instead of the model:
 * requests for voting recommendations, and signs of a personal crisis. These
 * must never depend on model judgment. Everything else goes to the model,
 * whose prompts carry the same rules.
 */

export type GuardrailKind = 'vote_advice' | 'crisis';

// Patterns run on normalised text: lowercase, straight apostrophes, single spaces.
const CRISIS = [
  /\b(kill|hurt|harm)(ing)?\s+myself\b(?!\s+financially)/,
  /\b(end(ing)?|take|taking)\s+my\s+(own\s+)?life\b(?!('s)?\s+(savings|insurance|expectancy|estate))/,
  /\bend(ing)?\s+it\s+all\b/,
  /\b(better\s+off\s+dead|wish\s+i\s+(was|were)\s+dead)\b/,
  // "Live" about a place or a budget ("live in Ohio", "live paycheck to paycheck") is not a crisis.
  /\b((don't|dont|do not)\s+want\s+to|no\s+reason\s+to)\s+(be\s+alive\b|live\b(?!\s+(in|on|with|near|somewhere|where|here|there|paycheck|off|beyond)\b|\s+at\b(?!\s+all\b)))/,
  /(?<!\b(don't|dont|do not|never)\s)\b(want(ed)?\s+to|wanna)\s+(die|be\s+dead)\b/,
  // Bare "suicide" / "self-harm" are policy topics; require first-person framing.
  /\bi('m|m| am|'ve| have| was)?\s+((been|so|really|very|pretty|kind of|kinda|a bit|a little|getting|becoming|feel|feeling|felt)\s+)*suicidal\b/,
  /(^|[.!?;:,—-])\s*(feeling|felt)\s+suicidal\b/,
  /\b(thinking|thought|thoughts|think|considering|considered|contemplating)\s+((about|of)\s+)?suicide\b(?!\s+(prevention|awareness|rates?)\b)/,
  /\b(want|wanna|going|gonna|plan(ning)?|about)\s+(to\s+)?commit\s+suicide\b/,
  /\bi('m|m| am|'ve| have)?\s+(been\s+)?self[-\s]?harm(ing)?\b/,
];

// Only requests for a recommendation aimed at the user. Factual questions about how
// parties or members voted, or what they support, go to the model.
const VOTE_ADVICE = [
  /\b(who|which\s+(candidate|party|one))\s+(should|do)\s+i\s+vote\b/,
  /\bwhat\s+should\s+i\s+vote\b/,
  /\bwhich\s+(candidate|party)\s+should\s+i\s+(support|back|pick|choose)\b/,
  /\bwho\s+should\s+i\s+(support|back)\b(?!\s+financially)/,
  /\bshould\s+i\s+vote\s+(for|against|yes|no|democrat(ic)?|republican|blue|red)\b/,
  /\bhow\s+should\s+i\s+vote\b/,
  /\btell\s+me\s+(who|how)\s+to\s+vote\b(?!\s+(by|early|absentee|in\s+person|from|overseas|online|if|when|where)\b)/,
  /\bis\s+\w+\s+(better|best)\s+(for\s+(me|us)\s+)?to\s+vote\s+(for|against|yes|no|democrat(ic)?|republican)\b/,
  /\b(who|which\s+(candidate|party))('s|\s+(is|are|would\s+be))\s+(better|best)\s+for\s+(me|my|us|our|people\s+like\s+me)\b/,
  /\b(is|are|would)\s+(the\s+)?(democrats?|republicans?|democratic\s+party|republican\s+party|gop)\s+(be\s+)?(better|best)\s+for\s+(me|my|us|our|people\s+like\s+me)\b/,
];

export function classifyGuardrail(text: string): GuardrailKind | null {
  // Merged turns can be long; the newest text is at the end.
  const t = text
    .slice(-4000)
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (CRISIS.some((r) => r.test(t))) return 'crisis';
  if (VOTE_ADVICE.some((r) => r.test(t))) return 'vote_advice';
  return null;
}

export const GUARDRAIL_REPLIES: Record<GuardrailKind, string> = {
  vote_advice:
    "I can't tell you how to vote or which candidate, party or ballot position to support — that's your call, and Politicon stays non-partisan.\n\n" +
    'What I can do is explain what specific proposals would do to your finances, side by side, using your profile. Name a policy or ballot measure and I\'ll walk through it.\n\n' +
    'For registration, deadlines and where to vote, see vote.gov.',
  crisis:
    "I'm really sorry you're going through this. You don't have to handle it alone.\n\n" +
    'If you\'re in the US, you can call or text 988 to reach the 988 Suicide & Crisis Lifeline any time, day or night. If you\'re in immediate danger, call 911.\n\n' +
    "If money worries are part of what's weighing on you, dialing 211 connects you with local help for rent, food and bills. I'm here to help with the financial side whenever you're ready.",
};
