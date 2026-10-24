import type { APIRoute } from 'astro';
import services from '../services.json';
import areas from '../areas.json';
import { homeFaqs } from '../lib/faqs.js';
import { TOWNS, CONFIRMED_ON } from '../lib/service-area.js';
import { SITE, BUSINESS, UPDATED } from '../lib/site-facts.js';

// /llms-full.txt: the longer companion to /llms.txt, for AI systems that want the substance in one fetch. Everything comes
// from the JSON the pages are built from. Deliberately left out: each service's `guarantee` text and scenario bodies
// (claims that stay on the service pages until the owner confirms them, see design/VOICE.md).
export const GET: APIRoute = () => {
  const lines = [
    `# ${BUSINESS.name}`,
    '',
    `> ${BUSINESS.summary}`,
    '',
    '## About',
    '',
    `${BUSINESS.name} is owner-operated by ${BUSINESS.owner}, ${BUSINESS.ownerTitle}, holder of ${BUSINESS.license}. The company is based in ${BUSINESS.locality}, ${BUSINESS.region} ${BUSINESS.postalCode} and has no public storefront: it travels to customers.`,
    '',
    `- Phone: ${BUSINESS.phone}`,
    `- Email: ${BUSINESS.email}`,
    `- Hours: ${BUSINESS.hours}`,
    `- Request form: ${SITE}/contact/`,
    `- Content last updated: ${UPDATED}`,
    '',
    '## Services',
    '',
    ...services.flatMap((s) => [
      `### ${s.title}`,
      '',
      `Page: ${SITE}/services/${s.slug}/`,
      '',
      s.tagline,
      '',
      s.intro,
      '',
      `Common situations: ${s.scenarios.map((x) => x.h).join('; ')}.`,
      '',
    ]),
    '## Service area',
    '',
    `Confirmed towns (owner-approved ${CONFIRMED_ON}): ${TOWNS.map((t) => t.name).join(', ')}. A town that is not listed is not refused: call ${BUSINESS.phone} to confirm availability.`,
    '',
    ...areas.flatMap((a) => [`### ${a.town}, ${BUSINESS.region}`, '', `Page: ${SITE}/areas/${a.slug}/`, '', a.meta_desc, '']),
    '## Frequently asked questions',
    '',
    ...homeFaqs().flatMap((f) => [`### ${f.q}`, '', f.a, '']),
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
