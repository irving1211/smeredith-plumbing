// Service-area coverage logic. Runs at build time (Astro), in the browser (checker) and in tests.
// The ONLY list of confirmed towns is src/service-area.json. A town that is not on it is never
// "rejected": the visitor is told to contact Shane to confirm availability.
import data from '../service-area.json' with { type: 'json' };
import options from '../service-options.json' with { type: 'json' };

export const TOWNS = data.towns;
export const HOME_TOWN = data.home;
export const CONFIRMED_ON = data.confirmedOn;
export const PHONE_TEL = '+17818204592';

const SERVICE_IDS = new Set(options.map((o) => o.id));
const STATE_ZIP_ONLY = /^(?:ma|mass|massachusetts)?\s*(?:\d{5}(?:-\d{4})?)?$/;

export const townBySlug = (slug) => TOWNS.find((t) => t.slug === slug) || null;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "City of Lynn", "Lynn, MA", "lynn ma 01902" -> "lynn"
function stripTownDecorations(value) {
  return normalize(value)
    .replace(/^(?:the\s+)?(?:city|town)\s+of\s+/, '')
    .replace(/,?\s*(?:ma|mass|massachusetts)\b.*$/, '')
    .replace(/,?\s*\d{5}(?:-\d{4})?$/, '')
    .replace(/[,;]+$/, '')
    .trim();
}

function exactTown(value) {
  const key = stripTownDecorations(value);
  if (!key) return null;
  return TOWNS.find((t) => t.slug === key || normalize(t.name) === key) || null;
}

/**
 * Find confirmed towns inside free text (a "town or address" field).
 * Prefers the locality segment ("..., Everett, MA 02149") over a street named after a town.
 */
export function detectTowns(text) {
  const norm = normalize(text);
  if (!norm) return { primary: null, matches: [], confidence: 'none' };

  const segments = norm.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (STATE_ZIP_ONLY.test(seg)) continue;
    const hit = exactTown(seg);
    if (hit && segments.length > 1) return { primary: hit.slug, matches: [hit.slug], confidence: 'segment' };
    if (hit && segments.length === 1) return { primary: hit.slug, matches: [hit.slug], confidence: 'exact' };
    break; // the last real segment is not a town: don't scan earlier (street) segments for a primary
  }

  const matches = TOWNS.filter((t) => new RegExp(`\\b${escapeRe(normalize(t.name))}\\b`).test(norm)).map((t) => t.slug);
  if (!matches.length) return { primary: null, matches: [], confidence: 'none' };
  return { primary: null, matches, confidence: 'mention' };
}

function contactHref(base, params) {
  const query = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}contact/${query ? `?${query}` : ''}`;
}

/**
 * Coverage answer for the checker.
 * @param {string} input   a town slug or what the visitor typed
 * @param {string} [serviceId]  a service id from service-options.json (unknown ids are dropped)
 * @param {{base?: string}} [opts]
 */
export function checkTown(input, serviceId, opts = {}) {
  const base = opts.base || '/';
  const service = SERVICE_IDS.has(serviceId) ? serviceId : '';
  const callHref = `tel:${PHONE_TEL}`;
  const typed = String(input ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 60);

  if (!typed) {
    return {
      status: 'choose',
      message: 'Pick your town to see if Shane serves it.',
      callHref,
      cta: { href: contactHref(base, { service }), label: 'Request service' },
    };
  }

  const town = exactTown(typed);
  if (town) {
    return {
      status: 'confirmed',
      town,
      note: town.note || '',
      message: `Yes — Shane serves ${town.name}.`,
      callHref,
      cta: { href: contactHref(base, { service, town: town.slug }), label: `Request service in ${town.name}` },
    };
  }

  return {
    status: 'unlisted',
    town: null,
    note: '',
    message: `Contact Shane to confirm availability in ${typed}. If it's close to the towns on the map, he'll tell you straight.`,
    callHref,
    // The typed text is NOT put in the URL (analytics tools record page URLs): the checker passes it to the
    // request page through sessionStorage. The no-JavaScript GET form is the only path that uses ?town_other=.
    cta: { href: contactHref(base, { service, town: 'other' }), label: 'Contact Shane to confirm availability', typed },
  };
}
