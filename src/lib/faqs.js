// The home page FAQ. One list feeds the visible accordion, the FAQPage schema (only emitted when the answers are
// visible on the page) and /ai/faq.json, so the three can never disagree.
import { TOWNS } from './service-area.js';
import { BUSINESS } from './site-facts.js';

export const homeFaqs = () => [
  {
    q: 'Who answers the phone?',
    a: `${BUSINESS.owner}, the owner. ${BUSINESS.name} is owner-operated, so you reach the owner directly. Call or text ${BUSINESS.phone}, or send a request and he will follow up.`,
  },
  {
    q: 'What areas do you serve?',
    a: `Based in ${BUSINESS.locality}, ${BUSINESS.region}, the company serves ${TOWNS.map((t) => t.name).join(', ')}. If your town is not on that list, call or send a request to confirm availability.`,
  },
  {
    q: 'Are you licensed?',
    a: `Yes. ${BUSINESS.owner} holds ${BUSINESS.license}.`,
  },
];
