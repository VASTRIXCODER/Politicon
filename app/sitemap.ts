import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { DISCLAIMER_UPDATED, PRIVACY_UPDATED, TERMS_UPDATED } from '@/lib/legal';

// Public pages only. Sign-in and app pages are left out: they send noindex.
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, lastModified?: string): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    priority,
    ...(lastModified ? { lastModified: new Date(`${lastModified}T00:00:00Z`) } : {}),
  });

  return [
    page('/', 1),
    page('/explorer', 0.8),
    page('/help', 0.5),
    page('/privacy', 0.3, PRIVACY_UPDATED),
    page('/terms', 0.3, TERMS_UPDATED),
    page('/disclaimer', 0.3, DISCLAIMER_UPDATED),
  ];
}
