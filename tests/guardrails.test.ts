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
    'Which one should I vote for?',
    'Should I vote yes on Measure ULA?',
    'Should I vote Democrat this year?',
    'Just tell me who to vote for',
    'Tell me how to vote on Prop 1',
    'Is it better for me to vote for the incumbent?',
    'Which party would be better for me?',
    'Would Republicans be better for my small business?',
    'Who’s better for my family, honestly?',
  ])('vote advice: %s', (t) => {
    expect(classifyGuardrail(t)).toBe('vote_advice');
  });

  it.each([
    'I want to die, these bills are too much',
    "I've been thinking about suicide",
    "I don't want to live anymore",
    'I don’t want to live anymore',
    'I do not want to be alive',
    'thinking of ending it, want to kill myself',
    'I’m thinking about killing myself',
    'I keep hurting myself',
    "I'm thinking about ending my life",
    'Taking my own life feels like the only way out',
    'I just want to end it all',
    "Honestly I'd be better off dead",
    'There is no reason to live anymore',
    "I don't want to live at all",
    'I’m suicidal',
    "I've been feeling really suicidal lately",
    'Feeling suicidal over this debt',
    "I've been self-harming again",
    'Who should I vote for? Honestly I want to die',
  ])('crisis: %s', (t) => {
    expect(classifyGuardrail(t)).toBe('crisis');
  });

  it('scans the end of a long merged message', () => {
    expect(classifyGuardrail(`${'How does the budget bill affect me? '.repeat(200)}I want to die`)).toBe('crisis');
    expect(classifyGuardrail(`${'x '.repeat(2000)}Who should I vote for?`)).toBe('vote_advice');
  });

  it('collapses whitespace and line breaks', () => {
    expect(classifyGuardrail('I want\n\nto   die')).toBe('crisis');
  });

  it.each([
    'How would Prop 33 affect my rent?',
    'What does the One Big Beautiful Bill do to my taxes?',
    'Compare what each party\'s tax plan would do to my take-home pay',
    'What is the deadline to vote in Ohio?',
    'This tax change is killing my budget',
    // Finance phrasings that share words with the crisis patterns
    'Would the estate tax change take my life savings?',
    'Is ending my life savings plan early a bad idea?',
    'Does this bill end my life insurance coverage?',
    'How does the bill change life expectancy assumptions for my pension?',
    'Am I hurting myself financially by not refinancing?',
    "I don't want to live in California anymore because of the taxes",
    'I don’t want to live paycheck to paycheck',
    'There is no reason to live in a high-tax state if I work remotely',
    "I don't want to die broke, how much should I save?",
    // Policy topics
    'What does the suicide prevention bill fund?',
    'Does the self-harm coverage bill change my premiums?',
    'How much suicide prevention funding is in the budget?',
    'Is Congress thinking about suicide prevention grants?',
    // Factual questions about parties and votes
    'How did Republicans vote on HR 1?',
    'What do Democrats support on taxes?',
    'Which side does this bill favor?',
    'Which party voted for the tax cut?',
    'Which candidate supports raising the minimum wage?',
    'Are Democrats or Republicans more likely to back the child tax credit?',
    'Is it better to vote early or by mail?',
    'Tell me how to vote by mail in Ohio',
  ])('normal question: %s', (t) => {
    expect(classifyGuardrail(t)).toBeNull();
  });
});
