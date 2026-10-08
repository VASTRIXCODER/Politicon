import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';
import Logo from '@/components/ui/Logo';

/** Centered card layout shared by the smaller auth pages (forgot, reset). */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-8">
      <AmbientBackground />
      <main id="main" tabIndex={-1} className="relative z-10 w-full max-w-md">
        <Link href="/auth/signin" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-8 group rounded-lg">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
          <span className="text-sm">Back to sign in</span>
        </Link>
        <Logo size="lg" href={null} className="mb-8 flex" />
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">{title}</h1>
        {subtitle && <p className="text-text-muted text-sm mb-8">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
