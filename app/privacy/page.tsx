import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/legal/LegalPage';
import { SUPPORT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy — Politicon',
  description: 'What Politicon collects, why, who processes it, how long it is kept, and how to export or delete it.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="Politicon estimates how government policies may affect your household finances. To do that we ask for a few facts about your situation. This page explains exactly what we collect, why, who processes it, how long we keep it, and how you can download or delete it."
    >
      <Section title="Who can use Politicon">
        <p>Politicon is for adults aged 18 and over. We don&apos;t knowingly create accounts for anyone younger. If you believe a minor has an account, email us and we will delete it.</p>
      </Section>

      <Section title="What we collect">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Account details:</strong> your email address, an optional first name, and your password (stored only as a secure hash by our authentication provider).</li>
          <li><strong>Your financial profile:</strong> state and optional city; age range; education; work situation and field; household income range; tax filing status; housing situation and, if you choose, a home-value range; types of debt (not balances); number and age ranges of dependents; your top financial concerns; and, if you choose, the kinds of investments you hold. We use ranges, never exact income or balances.</li>
          <li><strong>What you create:</strong> the policies in your feed, the analyses you generate, and your conversations with the AI policy guide.</li>
          <li><strong>Consent records:</strong> when you accepted these terms and agreed to AI processing.</li>
          <li><strong>Usage and security records:</strong> which AI features you used and when (for spending limits), and short-lived rate-limit counters. IP addresses are stored only as a one-way keyed hash.</li>
        </ul>
        <p>We don&apos;t collect bank or card details, Social Security numbers, or exact account balances, and we don&apos;t use advertising trackers.</p>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc pl-5 space-y-2">
          <li>To build your personalized policy feed and estimate each policy&apos;s effect on your finances.</li>
          <li>To answer your questions in the AI policy guide.</li>
          <li>To keep the service secure and within its spending limits.</li>
        </ul>
        <p>We don&apos;t sell your data, share it with advertisers, or use it to build a political profile of you.</p>
      </Section>

      <Section title="AI processing">
        <p>When you generate a feed, an analysis or a chat reply, we send the relevant parts of your financial profile (ranges and categories, never your name or email) and the policy text to Anthropic, which provides the AI model. Anthropic processes this to produce the response under its commercial terms and does not use it to train its models.</p>
      </Section>

      <Section title="Who processes your data">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Supabase:</strong> database and authentication (stores your account, profile, analyses and chats).</li>
          <li><strong>Anthropic:</strong> the AI model that generates analyses and replies.</li>
          <li><strong>Vercel:</strong> hosts the website and runs our servers.</li>
        </ul>
        <p>These providers process data only to run Politicon for us.</p>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc pl-5 space-y-2">
          <li>Your account, profile and saved analyses: until you delete them or your account.</li>
          <li>Cached policy feeds: 30 days after they were last refreshed.</li>
          <li>Conversations: 18 months after the last message, or until you delete them.</li>
          <li>AI usage records: 13 months.</li>
          <li>Accounts that are never confirmed: 7 days.</li>
          <li>Rate-limit counters: about an hour.</li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Download your data:</strong> Settings → Security → Download my data.</li>
          <li><strong>Edit your profile:</strong> Settings → Financial Profile. Your feed rebuilds from the new answers.</li>
          <li><strong>Delete an analysis or conversation:</strong> from its page or the conversation list.</li>
          <li><strong>Delete your account:</strong> Settings → Security → Delete Account. This permanently removes your profile, analyses, feed and conversations.</li>
        </ul>
        <p>Depending on where you live, you may have further rights to access, correct or delete your data. Email us and we&apos;ll respond within 30 days.</p>
      </Section>

      <Section title="Cookies">
        <p>We use only the cookies needed to keep you signed in, plus your device&apos;s local storage for preferences such as reading mode and onboarding drafts. We don&apos;t use advertising or cross-site tracking cookies.</p>
      </Section>

      <Section title="Contact">
        <p>Questions or requests: <a className="text-primary hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also our <Link className="text-primary hover:underline" href="/terms">Terms of Service</Link> and <Link className="text-primary hover:underline" href="/disclaimer">Disclaimer</Link>.</p>
      </Section>
    </LegalPage>
  );
}
