import type { APIRoute } from 'astro';
import services from '../services.json';
import { SITE, BUSINESS, UPDATED } from '../lib/site-facts.js';

// /feed.xml (RSS 2.0): the services and main pages, for readers and AI discovery. There is no blog, so items carry no
// <pubDate>: inventing one per page would be a fabricated date (the same reason sitemap.xml has no <lastmod>).
// <lastBuildDate> is the editorial UPDATED date, not the build time.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = () => {
  const items = [
    ...services.map((s) => ({ title: s.title, link: `${SITE}/services/${s.slug}/`, description: s.meta_desc })),
    { title: 'Our work', link: `${SITE}/work/`, description: 'Photos of recent water heater, boiler and kitchen and bath jobs.' },
    { title: 'Service area', link: `${SITE}/service-area/`, description: `The towns ${BUSINESS.name} serves, with a map and a ZIP code check.` },
    { title: `About ${BUSINESS.owner}`, link: `${SITE}/about/`, description: `${BUSINESS.owner} runs ${BUSINESS.name} personally.` },
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
    `<channel>\n` +
    `  <title>${esc(BUSINESS.name)}</title>\n` +
    `  <link>${SITE}/</link>\n` +
    `  <description>${esc(BUSINESS.summary)}</description>\n` +
    `  <language>en-us</language>\n` +
    `  <lastBuildDate>${new Date(`${UPDATED}T00:00:00Z`).toUTCString()}</lastBuildDate>\n` +
    `  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />\n` +
    items
      .map((i) => `  <item>\n    <title>${esc(i.title)}</title>\n    <link>${i.link}</link>\n    <guid isPermaLink="true">${i.link}</guid>\n    <description>${esc(i.description)}</description>\n  </item>`)
      .join('\n') +
    `\n</channel>\n</rss>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
