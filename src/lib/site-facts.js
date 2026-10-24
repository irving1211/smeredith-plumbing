// Business facts shared by the structured data in the base layout and by the AI-discovery files
// (/llms.txt, /ai/*.json, /feed.xml). Every value here is already published on the site and in
// design/VOICE.md "Approved claims"; nothing new is claimed. Town list: src/service-area.json (not repeated here).
export const SITE = 'https://smeredithplumbing.com';

export const BUSINESS = {
  name: 'S. Meredith Plumbing & Heating',
  owner: 'Shane Meredith',
  ownerTitle: 'Owner and MA master plumber',
  phone: '781-820-4592',
  phoneE164: '+1-781-820-4592',
  email: 'shane@smeredithplumbing.com',
  locality: 'Saugus',
  region: 'MA',
  postalCode: '01906',
  license: 'Massachusetts master plumber license 9630040-PL-M',
  hours: '24/7 emergency service',
  tagline: 'The plumber who answers the phone.',
  summary: 'Owner-operated plumbing and heating company based in Saugus, MA, serving the North Shore and Boston: water heaters, boilers, gas lines, remodel and new-construction plumbing, and 24/7 emergency service.',
  sameAs: [
    'https://www.facebook.com/people/S-Meredith-Plumbing-Heating/61577781267131/',
    'https://www.instagram.com/s.meredith_plumbing_heating/',
  ],
};

// Content dates. These are EDITORIAL dates, not the build date (a rebuild is not a content change, the same reason
// sitemap.xml carries no <lastmod>). Bump UPDATED only when the words or facts on the site change.
export const PUBLISHED = '2026-10-11'; // production go-live of the redesigned site
export const UPDATED = '2026-10-24';

export const formatDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
