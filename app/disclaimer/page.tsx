import type { Metadata } from 'next';
import LegalPage, { Section } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Disclaimer — Politicon',
  description: 'Politicon provides educational estimates, not financial, tax, legal or voting advice.',
};

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Disclaimer"
      intro="Politicon helps you understand how policies might affect your finances. It does not tell you what to do with your money or how to vote."
    >
      <Section title="Educational estimates, not advice">
        <p>Everything Politicon shows (dollar figures, charts, summaries and chat replies) is an AI-generated estimate for educational purposes. It is not financial, tax, legal, investment or benefits advice, and it is not a recommendation to take any action. For decisions that matter, check official sources and talk to a qualified professional, such as a CPA, a free IRS VITA tax clinic, or a HUD-approved housing counselor.</p>
      </Section>

      <Section title="How the estimates work">
        <p>Estimates are based on the ranges in your profile (not your exact income or balances) and on how the AI model reads each policy. Policies change as they move through legislatures and courts, and the model can make mistakes. Each analysis shows when it was generated and the profile it was based on. Treat the numbers as a starting point for understanding, not as a precise forecast.</p>
      </Section>

      <Section title="Non-partisan">
        <p>Politicon doesn&apos;t endorse candidates, parties or ballot positions, and it won&apos;t tell you how to vote. For official election information, visit <a className="text-primary hover:underline" href="https://vote.gov" target="_blank" rel="noreferrer">vote.gov</a>.</p>
      </Section>

      <Section title="If you need help now">
        <p>If you&apos;re struggling to pay for essentials, dial 211 to reach local assistance programs. If you&apos;re in crisis, call or text 988 (Suicide &amp; Crisis Lifeline) in the US.</p>
      </Section>
    </LegalPage>
  );
}
