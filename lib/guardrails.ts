/**
 * Messages answered with a fixed, reviewed reply instead of the model:
 * requests for voting recommendations, and signs of a personal crisis. These
 * must never depend on model judgment. Everything else goes to the model,
 * whose prompts carry the same rules.
 */

export type GuardrailKind = 'vote_advice' | 'crisis';

const CRISIS = [
  /\b(kill|hurt|harm)\s+myself\b/i,
  /\b(suicid(e|al)|self[-\s]?harm)\b/i,
  /\b(end|take)\s+my\s+(own\s+)?life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\b(don'?t|do not)\s+want\s+to\s+(live|be alive)\b/i,
];

const VOTE_ADVICE = [
  /\bwho\s+should\s+i\s+vote\b/i,
  /\bshould\s+i\s+vote\s+(for|against|yes|no)\b/i,
  /\bhow\s+should\s+i\s+vote\b/i,
  /\bwhich\s+(candidate|party|side)\s+(should|do\s+you|would\s+you|is\s+better|is\s+best)\b/i,
  /\b(who|which\s+(candidate|party))\s+(is|are)\s+(better|best)\s+for\s+(me|my|people\s+like\s+me)\b/i,
  /\b(vote|voting)\s+(democrat|republican|blue|red)\b.*\?/i,
  /\b(democrats?|republicans?)\s+or\s+(democrats?|republicans?)\b.*\b(vote|better|best|support)\b/i,
];

export function classifyGuardrail(text: string): GuardrailKind | null {
  const t = text.slice(0, 2000);
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
