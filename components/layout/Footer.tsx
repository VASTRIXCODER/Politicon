import Link from 'next/link';
import { Zap, Twitter, Github, Linkedin } from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Policy Explorer', href: '/explorer' },
    { label: 'AI Advisor', href: '/advisor' },
    { label: 'Impact Dashboard', href: '/impact' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Press', href: '/press' },
  ],
  Legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
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
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <span className="font-display font-semibold text-lg">
                Politi<span className="text-primary">con</span>
              </span>
            </Link>
            <p className="text-text-muted text-sm leading-relaxed max-w-xs">
              Non-partisan AI that translates government policies into your personal dollar impact. Not political opinion — just the answer.
            </p>
            <div className="flex items-center gap-4 mt-6">
              <a href="#" className="text-text-muted hover:text-primary transition-colors"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="text-text-muted hover:text-primary transition-colors"><Github className="w-4 h-4" /></a>
              <a href="#" className="text-text-muted hover:text-primary transition-colors"><Linkedin className="w-4 h-4" /></a>
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-4">{group}</h4>
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
