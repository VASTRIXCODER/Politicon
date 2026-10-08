import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';
import AmbientBackground from '@/components/landing/AmbientBackground';

/** Centered card layout shared by the smaller auth pages (forgot, reset). */
export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 sm:p-8">
      <AmbientBackground />
      <main className="relative z-10 w-full max-w-md">
        <Link href="/auth/signin" className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary transition-colors mb-8 group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm">Back to sign in</span>
        </Link>
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <span className="font-display font-semibold text-xl">Politi<span className="text-primary">con</span></span>
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary mb-2">{title}</h1>
        {subtitle && <p className="text-text-muted text-sm mb-8">{subtitle}</p>}
        {children}
      </main>
    </div>
  );
}
