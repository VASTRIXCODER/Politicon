import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { SUPPORT_EMAIL } from '@/lib/legal';

const footerLinks = {
  Product: [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'AI Policy Guide', href: '/advisor' },
    { label: 'Impact Dashboard', href: '/impact' },
  ],
  Support: [
    { label: 'Help & FAQ', href: '/help' },
    { label: 'Contact us', href: `mailto:${SUPPORT_EMAIL}` },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Disclaimer', href: '/disclaimer' },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-white/8 bg-base/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Logo size="md" className="flex w-fit mb-4" />
            <p className="text-text-muted text-sm leading-relaxed max-w-xs">
              Non-partisan AI that translates government policies into your personal dollar impact. Not political opinion — just the answer.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">{group}</h2>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-text-muted hover:text-text-primary transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/8 mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-muted">
            &copy; {new Date().getFullYear()} Politicon. All rights reserved.
          </p>
          <p className="text-xs text-text-muted">
            Financial impact estimates are for informational purposes only. Not financial advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
