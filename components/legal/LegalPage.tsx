import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { LEGAL_UPDATED } from '@/lib/legal';

/** Shared layout for the Privacy, Terms and Disclaimer pages. */
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative bg-base">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-28 pb-24">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-text-primary mb-3">{title}</h1>
        <p className="text-sm text-text-muted mb-10">Last updated {LEGAL_UPDATED}</p>
        <p className="text-base text-text-primary/90 leading-relaxed mb-10">{intro}</p>
        <div className="legal-prose space-y-8 text-sm sm:text-base leading-relaxed text-text-primary/85">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold text-text-primary mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
