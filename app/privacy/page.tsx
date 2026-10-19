import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { Section } from '@/components/legal/LegalPage';
import { PRIVACY_UPDATED, SUPPORT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What Politicon collects, why, who processes it, how long it is kept, and how to export or delete it.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title={<>Privacy <em>Policy</em></>}
      intro="Politicon estimates how government policies may affect your household finances. To do that we ask for a few facts about your situation. This page explains exactly what we collect, why, who processes it, how long we keep it, and how you can download or delete it."
      updated={PRIVACY_UPDATED}
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
          <li><strong>Update list:</strong> if you join it from the home page, your email address and when you joined. You don&apos;t need an account for this.</li>
          <li>
            <strong>Usage analytics</strong> (on the hosted site, through Vercel Web Analytics and Speed Insights, which don&apos;t use cookies):
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Page views:</strong> the page address with its query string and anything after <code>#</code> removed (so questions you type, email-link tokens and policy ids are never sent), the site that referred you, and the browser, operating system, device type and country that Vercel works out from your request. Vercel counts unique visitors with an anonymous value that changes every day, not a cookie or account id.</li>
              <li><strong>Feature events</strong> from a fixed list: signed up, finished onboarding, refreshed the feed, asked for an analysis, analysis ready, sent a message to the AI policy guide, dismissed a policy, and gave feedback. An event can carry only these labels: where in the app it happened, the policy&apos;s category (such as housing or taxes), how it turned out (worked, failed, came from the cache, or was declined by the guide&apos;s safety rules), your reading mode, what feedback was about and its rating, and whether sign-up needed email confirmation. Events never include your profile answers, income, dollar amounts, policy titles, messages, feedback text, name or email.</li>
              <li><strong>Performance measurements:</strong> how quickly each page loaded and responded (Core Web Vitals) and your connection type (for example 4g), reported against the page address with the query string removed.</li>
            </ul>
          </li>
        </ul>
        <p>We don&apos;t collect bank or card details, Social Security numbers, or exact account balances, and we don&apos;t use advertising trackers.</p>
      </Section>

      <Section title="How we use it">
        <ul className="list-disc pl-5 space-y-2">
          <li>To build your personalized policy feed and estimate each policy&apos;s effect on your finances.</li>
          <li>To answer your questions in the AI policy guide.</li>
          <li>To keep the service secure and within its spending limits.</li>
          <li>To see, in aggregate, which pages and features are used, where people stop during sign-up and onboarding, and which pages are slow, so we can fix and improve them. We don&apos;t use analytics to profile or contact individual people.</li>
          <li>If you joined the update list, to email you about Politicon updates. We don&apos;t send a digest or policy alerts yet.</li>
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
          <li><strong>Vercel:</strong> hosts the website and runs our servers, and provides Web Analytics and Speed Insights, which receive the usage analytics described above.</li>
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
          <li>Usage analytics: kept by Vercel for the retention period of our Vercel plan, as aggregate counts that aren&apos;t linked to your account.</li>
          <li>Update-list addresses: until you ask to be removed or delete your account.</li>
        </ul>
      </Section>

      <Section title="Your choices">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Download your data:</strong> Settings → Account → Download my data.</li>
          <li><strong>Edit your profile:</strong> Settings → Profile. Your feed rebuilds from the new answers.</li>
          <li><strong>Delete an analysis or conversation:</strong> from its page or the conversation list.</li>
          <li><strong>Delete your account:</strong> Settings → Account → Delete account. This permanently removes your profile, analyses, feed and conversations, and takes your account&apos;s email address off the update list.</li>
          <li><strong>Leave the update list:</strong> email us from the address you signed up with and we&apos;ll remove it.</li>
        </ul>
        <p>Depending on where you live, you may have further rights to access, correct or delete your data. Email us and we&apos;ll respond within 30 days.</p>
      </Section>

      <Section title="Cookies">
        <p>We use only the cookies needed to keep you signed in, plus your device&apos;s local storage for preferences such as reading mode and onboarding drafts. Our usage analytics don&apos;t set cookies or use local storage. We don&apos;t use advertising or cross-site tracking cookies.</p>
      </Section>

      <Section title="Contact">
        <p>Questions or requests: <a className="text-primary-300 underline-offset-2 hover:underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. See also our <Link className="text-primary-300 underline-offset-2 hover:underline" href="/terms">Terms of Service</Link> and <Link className="text-primary-300 underline-offset-2 hover:underline" href="/disclaimer">Disclaimer</Link>.</p>
      </Section>
    </LegalPage>
  );
}
