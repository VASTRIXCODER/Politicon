import { Briefcase, DollarSign, GraduationCap, Heart, Home, type LucideIcon } from 'lucide-react';
import type { ChatMessage } from '@/types';
import type { GuardrailKind } from '@/lib/guardrails';

/** A policy the next question is about (sent as policyId; the server resolves it). */
export interface PolicyMeta {
  policyId: string;
  policyTitle: string;
  category?: string;
  context?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ExtendedMessage[];
  policy_id?: string;
  created_at: string;
  updated_at?: string;
}

export interface ExtendedMessage extends ChatMessage {
  policyId?: string;
  policyTitle?: string;
  category?: string;
  summary?: string;
  dollarLine?: string;
  hasFullAnalysis?: boolean;
  compiling?: boolean;
  /** UI-only messages (greeting, errors) are never sent to the model or saved. */
  local?: boolean;
  /** Set when the reply is a fixed safety response rather than model output. */
  guardrail?: GuardrailKind | string;
  /** On an error bubble: what to resend when the user taps "Try again". */
  retry?: { text: string; policyMeta?: PolicyMeta };
}

/** General questions; specific bills come from the user's own policies (the rail). */
export const QUICK_PROMPTS: { icon: LucideIcon; label: string; text: string }[] = [
  { icon: DollarSign, label: 'Taxes', text: 'Which kinds of tax changes would affect someone in my situation the most?' },
  { icon: Home, label: 'Housing', text: 'What kinds of housing policies could change my monthly housing costs?' },
  { icon: Heart, label: 'Healthcare', text: 'How do changes to health insurance subsidies usually affect households like mine?' },
  { icon: GraduationCap, label: 'Student loans', text: 'How could federal student loan policy changes affect my budget?' },
  { icon: Briefcase, label: 'Work', text: 'Which labor and wage policies are most relevant to my job situation?' },
];

export const MAX_HISTORY_TURNS = 20;
export const MAX_TURN_CHARS = 4000;
/** Longest question accepted from ?q= (the landing page's search box). */
export const MAX_PREFILL_CHARS = 500;
/** How many saved conversations the history lists. */
export const MAX_SESSIONS = 30;
/** How many of the user's own analyses the rail reads. */
export const MAX_RAIL_ANALYSES = 12;

export const INITIAL_MESSAGE: ExtendedMessage = {
  id: '0',
  local: true,
  role: 'assistant',
  content: "Hi, I'm Politicon's AI Policy Guide. I can explain how policies may affect your finances, using the ranges in your profile. My numbers are educational estimates, not financial advice.\n\nPick one of your policies to ask about it, or ask me anything.",
  timestamp: new Date(),
};

/** The question a policy chip (or a drop on the orb, or the dashboard's hand-off) asks. */
export function policyQuestion(title: string): string {
  return `Tell me about the financial impact of ${title}`;
}
