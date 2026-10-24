import type { APIRoute } from 'astro';
import { homeFaqs } from '../../lib/faqs.js';
import { SITE, BUSINESS, UPDATED } from '../../lib/site-facts.js';

// /ai/faq.json: the same question list the home page shows and marks up as FAQPage (src/lib/faqs.js).
export const GET: APIRoute = () => {
  const body = {
    business: BUSINESS.name,
    url: `${SITE}/`,
    dateModified: UPDATED,
    faqs: homeFaqs().map((f) => ({ question: f.q, answer: f.a })),
  };
  return new Response(JSON.stringify(body, null, 2) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
