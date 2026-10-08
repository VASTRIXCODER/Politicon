import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/legal/LegalPage';
import { SUPPORT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Help — Politicon',
  description: 'Answers to common questions about Politicon, and how to reach support.',
};

const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Where do the policies come from?',
    a: <>Federal bills and laws come from Congress.gov and state bills from Open States. Each policy links to its official record and shows its status and latest action. The AI picks the ones most relevant to your profile and explains them.</>,
  },
  {
    q: 'How are the dollar estimates made?',
    a: <>An AI model (Anthropic&apos;s Claude) reads the policy&apos;s official summary and applies it to the ranges in your profile. Every analysis lists the assumptions it made and a confidence level. They are educational estimates, not tax calculations or advice. See the <Link className="text-primary-300 underline-offset-2 hover:underline" href="/disclaimer">Disclaimer</Link>.</>,
  },
  {
    q: 'The numbers look wrong for me. What can I do?',
    a: <>First check your profile in <Link className="text-primary-300 underline-offset-2 hover:underline" href="/settings">Settings</Link>. Analyses are based on the profile at the time they were made, and you&apos;ll see a &ldquo;Re-analyze&rdquo; option when it has changed. You can also use the thumbs-down or report button under any analysis so we can review it.</>,
  },
  {
    q: 'I didn’t get my confirmation or reset email.',
    a: <>Check your spam folder, then request a new one from the <Link className="text-primary-300 underline-offset-2 hover:underline" href="/auth/forgot">password reset page</Link> or the sign-up screen. Links expire after about an hour and work only once.</>,
  },
  {
    q: 'Can I download or delete my data?',
    a: <>Yes. In <Link className="text-primary-300 underline-offset-2 hover:underline" href="/settings">Settings</Link> you can export everything we store about you as a file or delete your account entirely. To delete a single analysis, open it from your <Link className="text-primary-300 underline-offset-2 hover:underline" href="/impact">Impact dashboard</Link> and use the delete option on its page; to delete a conversation, use the trash icon next to it in the <Link className="text-primary-300 underline-offset-2 hover:underline" href="/advisor">AI Policy Guide</Link>&apos;s chat history. See the <Link className="text-primary-300 underline-offset-2 hover:underline" href="/privacy">Privacy Policy</Link> for details.</>,
  },
  {
    q: 'Will Politicon tell me how to vote?',
    a: <>No. Politicon is non-partisan and won&apos;t recommend candidates, parties or ballot positions. For official election information, visit <a className="text-primary-300 underline-offset-2 hover:underline" href="https://vote.gov" target="_blank" rel="noopener noreferrer">vote.gov<span className="sr-only"> (opens in a new tab)</span></a>.</>,
  },
];

export default function HelpPage() {
  return (
    <LegalPage title="Help" intro="Quick answers to common questions. If you can't find what you need, email us and a person will reply." showUpdated={false}>
      {FAQ.map(({ q, a }) => (
        <Section key={q} title={q}>
          <p>{a}</p>
        </Section>
      ))}
      <Section title="Contact support">
        <p>
          Email <a className="text-primary-300 underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Please don&apos;t
          send passwords or full financial details. To report a security issue, use the same address with &ldquo;Security&rdquo; in the subject.
        </p>
      </Section>
    </LegalPage>
  );
}
