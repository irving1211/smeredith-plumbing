import type { APIRoute } from 'astro';
import services from '../../services.json';
import { TOWNS } from '../../lib/service-area.js';
import { SITE, BUSINESS, UPDATED } from '../../lib/site-facts.js';

// /ai/service.json: each service the company offers, with its page, a one-line summary and the situations it covers.
export const GET: APIRoute = () => {
  const body = {
    provider: { name: BUSINESS.name, url: `${SITE}/`, phone: BUSINESS.phone },
    areaServed: TOWNS.map((t) => `${t.name}, ${BUSINESS.region}`),
    emergencyService: BUSINESS.hours,
    dateModified: UPDATED,
    services: services.map((s) => ({
      name: s.title,
      url: `${SITE}/services/${s.slug}/`,
      summary: s.meta_desc,
      tagline: s.tagline,
      commonSituations: s.scenarios.map((x) => x.h),
    })),
  };
  return new Response(JSON.stringify(body, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
