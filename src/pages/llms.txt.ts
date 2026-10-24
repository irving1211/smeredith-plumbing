import type { APIRoute } from 'astro';
import services from '../services.json';
import areas from '../areas.json';
import { TOWNS, CONFIRMED_ON } from '../lib/service-area.js';
import { SITE, BUSINESS, UPDATED } from '../lib/site-facts.js';

// /llms.txt (llmstxt.org format): a plain-markdown map of the site for AI systems. It is an organisational signal, not a
// ranking factor. Everything below is generated from the same JSON the pages are built from, so it cannot drift.
export const GET: APIRoute = () => {
  const lines = [
    `# ${BUSINESS.name}`,
    '',
    `> ${BUSINESS.summary}`,
    '',
    `Owner: ${BUSINESS.owner}, ${BUSINESS.license}. Phone ${BUSINESS.phone}. Email ${BUSINESS.email}. ${BUSINESS.hours}. Based in ${BUSINESS.locality}, ${BUSINESS.region} ${BUSINESS.postalCode}. Content last updated ${UPDATED}.`,
    '',
    '## Services',
    '',
    ...services.map((s) => `- [${s.title}](${SITE}/services/${s.slug}/): ${s.meta_desc}`),
    '',
    '## Service area',
    '',
    `Confirmed towns (owner-approved ${CONFIRMED_ON}): ${TOWNS.map((t) => t.name).join(', ')}. A town that is not listed is not refused: call ${BUSINESS.phone} to confirm availability.`,
    '',
    ...areas.map((a) => `- [${a.town}, ${BUSINESS.region}](${SITE}/areas/${a.slug}/): ${a.meta_desc}`),
    '',
    '## Key pages',
    '',
    `- [About ${BUSINESS.owner}](${SITE}/about/): the owner, the van, and customer reviews quoted from Google.`,
    `- [Our work](${SITE}/work/): photos of recent water heater, boiler and kitchen and bath jobs.`,
    `- [Service area](${SITE}/service-area/): the full town list and a map; enter a ZIP code to check coverage.`,
    `- [Request service](${SITE}/contact/): the request form, with optional photo.`,
    '',
    '## Machine-readable',
    '',
    `- [Business summary](${SITE}/ai/summary.json): name, contact, location, hours, towns and services as JSON.`,
    `- [Services](${SITE}/ai/service.json): each service with its page, summary and common situations.`,
    `- [FAQ](${SITE}/ai/faq.json): the questions answered on the home page.`,
    '',
    '## Optional',
    '',
    `- [Full text version](${SITE}/llms-full.txt): this file with each service's introduction and the FAQ in full.`,
    `- [Sitemap](${SITE}/sitemap.xml)`,
    `- [Feed](${SITE}/feed.xml)`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
