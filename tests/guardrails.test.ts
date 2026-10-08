import { describe, expect, it } from 'vitest';
import { classifyGuardrail } from '@/lib/guardrails';

describe('classifyGuardrail', () => {
  it.each([
    'Who should I vote for in November?',
    'should I vote for Prop 33?',
    'How should I vote on the ballot measure?',
    'Which candidate is better for me financially?',
    'Which party should I support?',
    'Democrats or Republicans — who is better for my taxes, who should I support?',
  ])('vote advice: %s', (t) => {
    expect(classifyGuardrail(t)).toBe('vote_advice');
  });

  it.each([
    'I want to die, these bills are too much',
    "I've been thinking about suicide",
    "I don't want to live anymore",
    'thinking of ending it, want to kill myself',
  ])('crisis: %s', (t) => {
    expect(classifyGuardrail(t)).toBe('crisis');
  });

  it.each([
    'How would Prop 33 affect my rent?',
    'What does the One Big Beautiful Bill do to my taxes?',
    'Compare what each party\'s tax plan would do to my take-home pay',
    'What is the deadline to vote in Ohio?',
    'This tax change is killing my budget',
  ])('normal question: %s', (t) => {
    expect(classifyGuardrail(t)).toBeNull();
  });
});
