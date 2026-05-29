import type { APIRoute } from 'astro';
import services from '../services.json';
import areas from '../areas.json';

export const GET: APIRoute = ({ site }) => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const origin = (site?.toString() || 'https://smeredithplumbing.com').replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);

  const urls = [
    { loc: `${origin}${base}/`, priority: '1.0', changefreq: 'weekly' },
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
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
