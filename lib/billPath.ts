import type { PolicyRecord } from '@/types';

/**
 * Where a bill stands on its way to becoming law, read from its official
 * record: the record's status and the wording of its latest action. It is
 * the furthest stage the record shows the bill has reached, never a
 * prediction of what happens next, and it stays empty for anything that
 * wasn't verified against an official source (an AI's word is never a status).
 *
 *   Introduced → Committee → Floor → Other chamber → Signed
 *
 * A one-house legislature (Nebraska, the D.C. Council) has no other chamber,
 * so its path has four stages. Pure and client-safe: it mirrors the server's
 * statusFromAction (lib/server/legislation.ts) only where an older record
 * lacks a stored status.
 */

export type BillStage = 'introduced' | 'committee' | 'floor' | 'other-chamber' | 'signed';

export const BILL_STAGES: readonly BillStage[] = ['introduced', 'committee', 'floor', 'other-chamber', 'signed'];

export const BILL_STAGE_LABELS: Record<BillStage, string> = {
  introduced: 'Introduced',
  committee: 'Committee',
  floor: 'Floor',
  'other-chamber': 'Other chamber',
  signed: 'Signed',
};

/**
 * done: the record shows the stage completed. current: the bill is at it now.
 * stopped: the bill failed or was vetoed there. upcoming: not reached.
 */
export type StepState = 'done' | 'current' | 'stopped' | 'upcoming';

export interface BillStep {
  id: BillStage;
  label: string;
  state: StepState;
}

/** in-progress: still moving (as far as the record shows). */
export type BillOutcome = 'in-progress' | 'enacted' | 'failed' | 'repealed';

export interface BillPathModel {
  /** false when there's no verified official record: no stage is shown at all. */
  known: boolean;
  steps: BillStep[];
  /** Index into `steps` of the furthest stage the record shows; -1 when unknown. */
  reached: number;
  outcome: BillOutcome | null;
  /** Plain words for where it stands: "In committee", "Passed the House", "Became law". */
  headline: string;
  /** The chamber the bill was introduced in, when the bill number or record says ("House", "Senate", "Assembly"). */
  origin: string | null;
  /** The record's latest action, verbatim, and its date (YYYY-MM-DD). */
  latestAction: string | null;
  latestActionDate: string | null;
  /** When the record was read (an ISO timestamp): what "as of" refers to. */
  asOf: string | null;
}

type Chamber = 'lower' | 'upper';

/** Legislatures with one house (Open States region names). */
const UNICAMERAL: Record<string, string> = { nebraska: 'Legislature', 'district of columbia': 'Council' };

/** States whose lower house is the Assembly (bill numbers start with A). */
const ASSEMBLY_STATES = new Set(['california', 'nevada', 'new york', 'wisconsin', 'new jersey']);

const isFederal = (region: string | null | undefined) =>
  !region || /^(federal|us|u\.s\.|united states|national)$/i.test(region.trim());

/**
 * The chamber a bill starts in, from the record's bill type or the bill
 * number's prefix: H.R., H.J.Res., HB, HF, AB, A… are the lower house; S.,
 * S.J.Res., SB, SF… the upper. Null when the number doesn't say (Maine's LD).
 */
function originChamber(record: PolicyRecord | undefined, billNumber: string | undefined): Chamber | null {
  const code = (record?.billType || record?.billNumber || billNumber || '').trim().charAt(0).toUpperCase();
  return code === 'H' || code === 'A' ? 'lower' : code === 'S' ? 'upper' : null;
}

function chamberName(chamber: Chamber, federal: boolean, region: string): string {
  if (chamber === 'upper') return 'Senate';
  return !federal && ASSEMBLY_STATES.has(region.toLowerCase()) ? 'Assembly' : 'House';
}

/** Which chambers the action's wording mentions ("Received in the Senate", "In Assembly."). */
function chambersMentioned(t: string): Set<Chamber> {
  // "Received from the House": it has left the House, so it's in the other one.
  const from = t.match(/received from (the )?(house|assembly|senate)/);
  if (from) return new Set<Chamber>([from[2] === 'senate' ? 'lower' : 'upper']);
  const words = t.replace(/white house/g, ' ');
  const out = new Set<Chamber>();
  if (/\bsenate\b/.test(words)) out.add('upper');
  if (/\b(house|assembly)\b/.test(words)) out.add('lower');
  return out;
}

const PASSED = /\bpassed\b|agreed to|concurred/;

interface Found {
  stage: BillStage;
  /** The record shows this stage completed (a chamber passed it), not just reached. */
  done: boolean;
  /** both: the two chambers agreed on one text. conference: they're reconciling theirs. override: a veto is being taken up. */
  note?: 'both' | 'conference' | 'override';
}

/** The furthest stage the action's wording shows, within one chamber or across both. */
function stageFromAction(text: string, origin: Chamber | null, unicameral: boolean): Found {
  const t = text.toLowerCase();
  if (/\bveto/.test(t)) return { stage: 'signed', done: false, note: 'override' };
  if (/presented to (the )?(president|governor|mayor)|(sent|delivered|transmitted) to (the )?(governor|mayor)|awaiting (the )?(governor|president)/.test(t)) {
    return { stage: 'signed', done: false };
  }
  // Enrolled: the final text both chambers (or the one) passed, before it goes for signature.
  const both: BillStage = unicameral ? 'floor' : 'other-chamber';
  if (/\benrolled\b|cleared for (the )?white house|passed both/.test(t)) return { stage: both, done: true, note: 'both' };
  if (!unicameral) {
    if (/conference|resolving differences/.test(t)) return { stage: 'other-chamber', done: false, note: 'conference' };
    if (/\bconcurred\b|concurrence/.test(t)) return { stage: 'other-chamber', done: true, note: 'both' };
    const named = chambersMentioned(t);
    const other = origin === 'lower' ? 'upper' : origin === 'upper' ? 'lower' : null;
    // Both chambers named ("Message on Senate action sent to the House"), or only the one it didn't start in.
    if (named.size === 2 || (other && named.has(other) && !named.has(origin!))) {
      return { stage: 'other-chamber', done: PASSED.test(t) && named.size === 1 };
    }
  }
  // Within its first (or only) chamber. Sent back to a committee beats a committee's report.
  // ("Withdrawn from <committee>" and Florida's "Now in <committee>" are re-referrals.)
  if (/re-?refer|\breferred\b|refer to com|left pending|\bnow in\b|withdrawn from (?!further)|\bhearings?\b|mark-?up|in committee/.test(t)) {
    return { stage: 'committee', done: false };
  }
  if (PASSED.test(t)) return { stage: 'floor', done: true };
  if (/reported|do pass|out of committee|calendar|third read|read (a )?third time|engross|second read|read (a )?second time|floor|considered|passage|yeas|roll ?call/.test(t)) {
    return { stage: 'floor', done: false };
  }
  if (/committee|\bcom\.|referred/.test(t)) return { stage: 'committee', done: false };
  return { stage: 'introduced', done: false };
}

/** An older record's status from its wording, where none was stored (a subset of statusFromAction). */
function fallbackStatus(text: string): PolicyRecord['status'] {
  const t = text.toLowerCase();
  if (/became (public |private )?law|signed by (the )?(president|governor)|approved by (the )?governor|chaptered|enacted/.test(t)) return 'enacted';
  if (/not agreed to|\bfailed\b|not passed|veto(ed)? (message|by)|vetoed|indefinitely postponed|\bdied (in|on|at)\b/.test(t)) return 'rejected';
  if (PASSED.test(t) || /presented to|enrolled/.test(t)) return 'passed';
  return 'proposed';
}

/** A record date as "Sep 15, 2026", the same on server and client (lib/recordDate.ts). */
export { formatRecordDate } from '@/lib/recordDate';

/**
 * The bill path for a feed item or an analysis. `fallback` fills in the bill
 * number and region when an older record didn't keep them.
 */
export function billPath(record: PolicyRecord | null | undefined, fallback: { billNumber?: string; region?: string } = {}): BillPathModel {
  const region = (record?.region || fallback.region || '').trim();
  const federal = isFederal(region);
  const unicameralName = UNICAMERAL[region.toLowerCase()];
  const stages = unicameralName ? BILL_STAGES.filter((s) => s !== 'other-chamber') : BILL_STAGES;
  const steps = (states: (i: number) => StepState): BillStep[] =>
    stages.map((id, i) => ({ id, label: BILL_STAGE_LABELS[id], state: states(i) }));

  const latestAction = record?.latestAction?.trim() || null;
  const base = {
    latestAction: record?.verified ? latestAction : null,
    latestActionDate: record?.verified ? record.latestActionDate || null : null,
    asOf: record?.asOf || null,
  };

  if (!record?.verified) {
    return { known: false, steps: steps(() => 'upcoming'), reached: -1, outcome: null, headline: 'Stage not shown', origin: null, ...base };
  }

  const originSide = unicameralName ? null : originChamber(record, fallback.billNumber);
  const origin = unicameralName ?? (originSide ? chamberName(originSide, federal, region) : null);
  const other = originSide ? chamberName(originSide === 'lower' ? 'upper' : 'lower', federal, region) : null;
  const signer = federal ? 'President' : region.toLowerCase() === 'district of columbia' ? 'Mayor' : region ? 'Governor' : null;
  const status = record.status ?? (latestAction ? fallbackStatus(latestAction) : 'proposed');
  const last = stages.length - 1;

  if (status === 'enacted') {
    return { known: true, steps: steps(() => 'done'), reached: last, outcome: 'enacted', headline: 'Became law', origin, ...base };
  }

  let found: Found = latestAction ? stageFromAction(latestAction, originSide, !!unicameralName) : { stage: 'introduced', done: false };
  // The record says it passed a chamber even where the wording above doesn't show it.
  if (status === 'passed' && stages.indexOf(found.stage) < stages.indexOf('floor')) found = { stage: 'floor', done: true };
  const reached = Math.max(0, stages.indexOf(found.stage));
  const failed = status === 'rejected';
  const atStage: StepState = failed ? 'stopped' : found.done ? 'done' : 'current';
  // "the House", or the one-house legislature's own name.
  const firstChamber = unicameralName ?? origin;

  let headline: string;
  if (failed) {
    headline =
      found.stage === 'signed' ? 'Vetoed'
      : found.stage === 'committee' ? 'Stopped in committee'
      : found.stage === 'floor' ? (firstChamber ? `Failed in the ${firstChamber}` : 'Failed on the floor')
      : found.stage === 'other-chamber' ? (other ? `Failed in the ${other}` : 'Failed in the second chamber')
      : 'Did not advance';
  } else if (found.stage === 'signed') {
    headline = found.note === 'override' ? 'Vetoed; an override is under way' : signer ? `Sent to the ${signer}` : 'Sent for signature';
  } else if (found.note === 'both') {
    headline = unicameralName ? `Passed the ${unicameralName}` : 'Passed both chambers';
  } else if (found.stage === 'other-chamber') {
    headline =
      found.note === 'conference' ? 'Resolving differences between chambers'
      : found.done ? (other ? `Passed the ${other}` : 'Passed the second chamber')
      : other ? `In the ${other}` : 'In the second chamber';
  } else if (found.stage === 'floor') {
    headline = !found.done ? 'Out of committee' : firstChamber ? `Passed the ${firstChamber}` : 'Passed a chamber';
  } else {
    headline = found.stage === 'committee' ? 'In committee' : origin && !unicameralName ? `Introduced in the ${origin}` : 'Introduced';
  }

  return {
    known: true,
    steps: steps((i) => (i < reached ? 'done' : i === reached ? atStage : 'upcoming')),
    reached,
    outcome: failed ? 'failed' : status === 'repealed' ? 'repealed' : 'in-progress',
    headline,
    origin,
    ...base,
  };
}
