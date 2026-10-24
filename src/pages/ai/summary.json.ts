import type { APIRoute } from 'astro';
import services from '../../services.json';
import { TOWNS, CONFIRMED_ON } from '../../lib/service-area.js';
import { SITE, BUSINESS, PUBLISHED, UPDATED } from '../../lib/site-facts.js';

// /ai/summary.json: the business in one small, stable document for AI engines. Same facts as the schema.org markup.
export const GET: APIRoute = () => {
  const body = {
    name: BUSINESS.name,
    url: `${SITE}/`,
    type: 'Plumber',
    tagline: BUSINESS.tagline,
    description: BUSINESS.summary,
    owner: { name: BUSINESS.owner, title: BUSINESS.ownerTitle, license: BUSINESS.license },
    contact: { phone: BUSINESS.phone, email: BUSINESS.email, requestForm: `${SITE}/contact/` },
    location: { locality: BUSINESS.locality, region: BUSINESS.region, postalCode: BUSINESS.postalCode, country: 'US', note: 'Service-area business: no public storefront address.' },
    hours: BUSINESS.hours,
    serviceArea: { baseTown: BUSINESS.locality, confirmedTowns: TOWNS.map((t) => t.name), confirmedOn: CONFIRMED_ON, note: 'A town that is not listed is not refused; call to confirm availability.' },
    services: services.map((s) => ({ name: s.title, url: `${SITE}/services/${s.slug}/` })),
    profiles: BUSINESS.sameAs,
    resources: { llms: `${SITE}/llms.txt`, faq: `${SITE}/ai/faq.json`, services: `${SITE}/ai/service.json`, sitemap: `${SITE}/sitemap.xml` },
    datePublished: PUBLISHED,
    dateModified: UPDATED,
  };
  return new Response(JSON.stringify(body, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
