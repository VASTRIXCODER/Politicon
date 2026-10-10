import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Only the API is blocked. The sign-in, account and app pages stay crawlable on
// purpose: they send noindex from their layouts (or redirect to sign-in, which
// does), and a crawler only sees that noindex if robots.txt lets it fetch the
// page. Blocking them here would let their URLs be indexed from public links.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
