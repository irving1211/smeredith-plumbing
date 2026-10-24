import type { APIRoute } from 'astro';
import services from '../services.json';
import areas from '../areas.json';
import { isPrivacyPublished } from '../lib/privacy.js';

// Indexable pages only. Utility pages (thank-you, 404) are excluded. No <lastmod>:
// a build date is not a content-change date, and a fabricated lastmod gets ignored.
export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const origin = (site?.toString() || 'https://smeredithplumbing.com').replace(/\/$/, '');

  const urls = [
    { loc: `${origin}${base}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${origin}${base}/services/`, priority: '0.9', changefreq: 'monthly' },
    ...services.map((s) => ({
      loc: `${origin}${base}/services/${s.slug}/`,
      priority: '0.9',
      changefreq: 'monthly',
    })),
    ...areas.map((a) => ({
      loc: `${origin}${base}/areas/${a.slug}/`,
      priority: '0.8',
      changefreq: 'monthly',
    })),
    { loc: `${origin}${base}/service-area/`, priority: '0.8', changefreq: 'monthly' },
    { loc: `${origin}${base}/work/`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${origin}${base}/about/`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${origin}${base}/contact/`, priority: '0.7', changefreq: 'monthly' },
    // The privacy notice is in the sitemap while it is published (the default; PUBLIC_PRIVACY_PUBLISHED=0 withdraws it).
    ...(isPrivacyPublished(import.meta.env) ? [{ loc: `${origin}${base}/privacy/`, priority: '0.3', changefreq: 'yearly' }] : []),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
