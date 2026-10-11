// ZIP-first coverage answer. Runs in the browser (checker) and in tests; no network of its own.
//  - Geography comes from public/data/zip-coverage.json (Census ZCTA -> municipality land overlaps), fetched by the
//    checker only when someone checks a ZIP.
//  - Coverage comes ONLY from src/service-area.json (owner-confirmed towns). A valid ZIP is not automatically a
//    covered ZIP, and a town that is not confirmed is never refused: the visitor is asked to call Shane to confirm.
//  - src/service-area-proposed.json only changes the wording ("near where he works" vs "outside the towns he
//    usually covers"); it never produces a Yes.
//  - The ZIP itself never goes into a link, analytics or storage. Results are reported as enumerated states.
import area from '../service-area.json' with { type: 'json' };
import proposed from '../service-area-proposed.json' with { type: 'json' };
import options from '../service-options.json' with { type: 'json' };

export const PHONE_TEL = '+17818204592';
/** Every result state. Analytics receives only these strings. */
export const ZIP_STATES = ['covered', 'covered_check_area', 'shared', 'nearby_confirm', 'outside_confirm', 'not_found', 'invalid', 'lookup_error'];
/** A municipality covering less than this share of a ZIP's land is treated as boundary noise when deciding the answer. */
export const SIGNIFICANT_SHARE = 10;

const CONFIRMED = new Map(area.towns.map((t) => [t.slug, t]));
const PROPOSED = new Map(proposed.towns.map((t) => [t.slug, t]));
const SERVICE_IDS = new Set(options.map((o) => o.id));

/**
 * Validate a typed ZIP. Keeps it as text so leading zeroes survive (01906 is not 1906).
 * Accepts "01906", " 01906 ", "01906-1234", "01906 1234".
 * @returns {{ ok: true, zip: string } | { ok: false, reason: 'empty' | 'four_digits' | 'format' }}
 */
export function parseZip(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { ok: false, reason: 'empty' };
  const m = /^(\d{5})(?:[-\s]?\d{4})?$/.exec(raw);
  if (m) return { ok: true, zip: m[1] };
  if (/^\d{4}$/.test(raw)) return { ok: false, reason: 'four_digits' };
  return { ok: false, reason: 'format' };
}

/** Municipalities a ZIP overlaps, largest land share first, with each town's coverage status. */
export function townsForZip(zip, data) {
  const row = data?.zips?.[zip];
  if (!row) return null;
  const towns = [];
  for (let i = 2; i < row.length; i += 2) {
    const slug = row[i];
    const confirmed = CONFIRMED.get(slug);
    const prop = PROPOSED.get(slug);
    towns.push({
      slug,
      name: confirmed?.name || data.towns?.[slug] || slug,
      share: row[i + 1],
      status: confirmed ? 'confirmed' : prop ? 'proposed' : 'other',
      note: confirmed?.note || '',
    });
  }
  return { lat: row[0], lon: row[1], towns };
}

const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

function contactHref(base, params) {
  const query = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `${base}contact/${query ? `?${query}` : ''}`;
}

/**
 * The checker's answer for a typed ZIP.
 * @param {string} input what the visitor typed
 * @param {object|null} data parsed zip-coverage.json, or null when it failed to load
 * @param {string} [serviceId] a service id to carry into the request form (unknown ids are dropped)
 * @param {{ base?: string }} [opts]
 * @returns {{ state: string, zip: string, message: string, note: string, primary: object, secondary: object|null,
 *   pin: { lat: number, lon: number } | null, towns: object[], retry: boolean }}
 */
export function checkZip(input, data, serviceId, opts = {}) {
  const base = opts.base || '/';
  const service = SERVICE_IDS.has(serviceId) ? serviceId : '';
  const call = { kind: 'call', href: `tel:${PHONE_TEL}`, label: 'Call Shane to confirm' };
  const result = (state, fields) => ({ state, zip: '', note: '', secondary: null, pin: null, towns: [], retry: false, ...fields });

  const parsed = parseZip(input);
  if (!parsed.ok) {
    return result('invalid', {
      message: parsed.reason === 'four_digits'
        ? 'ZIP codes have 5 digits. Massachusetts ZIP codes start with 0, like 01906.'
        : 'Enter a 5-digit ZIP code, like 01906.',
      primary: null,
    });
  }
  const { zip } = parsed;

  if (!data || !data.zips) {
    return result('lookup_error', {
      zip,
      message: "The ZIP lookup didn't load. Try again, pick your town instead, or call Shane.",
      primary: { ...call, label: 'Call 781-820-4592' },
      retry: true,
    });
  }

  const found = townsForZip(zip, data);
  if (!found) {
    const ma = /^0(?:1|2)\d{3}$/.test(zip) || /^055\d{2}$/.test(zip);
    return result('not_found', {
      zip,
      message: ma
        ? `We couldn't place ZIP ${zip}. PO box and business-only ZIP codes aren't in the map data. Call Shane, or pick your town instead.`
        : `ZIP ${zip} isn't a Massachusetts ZIP code we can place. Call Shane if you think he can help, or pick your town instead.`,
      primary: call,
    });
  }

  const pin = found.lat == null ? null : { lat: found.lat, lon: found.lon };
  const significant = found.towns.filter((t) => t.share >= SIGNIFICANT_SHARE);
  const towns = significant.length ? significant : found.towns.slice(0, 1);
  const yes = towns.filter((t) => t.status === 'confirmed');
  const notYet = towns.filter((t) => t.status !== 'confirmed');
  const common = { zip, pin, towns: found.towns };

  if (yes.length && !notYet.length) {
    const top = yes[0];
    const checkArea = yes.find((t) => t.note);
    if (checkArea) {
      return result('covered_check_area', {
        ...common,
        message: `${checkArea.name} is on Shane's list. Call to confirm your neighborhood.`,
        note: yes.length > 1 ? `ZIP ${zip} is in ${list(yes.map((t) => t.name))}.` : `ZIP ${zip} is in ${checkArea.name}.`,
        primary: { ...call, label: 'Call to confirm' },
        secondary: { kind: 'request', href: contactHref(base, { service, town: top.slug }), label: `Request service in ${top.name}` },
      });
    }
    // Smaller parts of the ZIP (5% or more of its land) are named so a visitor near a town line recognises theirs.
    const minor = found.towns.filter((t) => t !== top && t.share >= 5).map((t) => t.name);
    return result('covered', {
      ...common,
      message: `Yes — Shane serves ${list(yes.map((t) => t.name))}.`,
      note: minor.length ? `ZIP ${zip} is mostly ${top.name}, with part of ${list(minor)}.` : `ZIP ${zip} is in ${top.name}.`,
      primary: { kind: 'request', href: contactHref(base, { service, town: top.slug }), label: 'Yes — request service' },
      secondary: { kind: 'call', href: `tel:${PHONE_TEL}`, label: 'Call 781-820-4592' },
    });
  }

  if (yes.length) {
    const top = yes[0];
    return result('shared', {
      ...common,
      message: `ZIP ${zip} covers parts of ${list(towns.map((t) => t.name))}. Call Shane to confirm.`,
      note: `${list(yes.map((t) => t.name))} ${yes.length > 1 ? 'are' : 'is'} on Shane's list; ${list(notYet.map((t) => t.name))} ${notYet.length > 1 ? "aren't" : "isn't"} confirmed yet.`,
      primary: call,
      secondary: { kind: 'request', href: contactHref(base, { service, town: top.slug }), label: `In ${top.name}? Request service` },
    });
  }

  const top = towns[0];
  const near = top.status === 'proposed';
  return result(near ? 'nearby_confirm' : 'outside_confirm', {
    ...common,
    message: near
      ? `${top.name} isn't on Shane's confirmed list yet, but it's near where he works. Call Shane to confirm.`
      : `${top.name} is outside the towns Shane usually covers. Call to ask: he'll tell you straight.`,
    note: towns.length > 1 ? `ZIP ${zip} covers parts of ${list(towns.map((t) => t.name))}.` : `ZIP ${zip} is in ${top.name}.`,
    primary: call,
    // The town NAME (from Census data, not typed) is handed to the form through sessionStorage, never the URL.
    secondary: { kind: 'request', href: contactHref(base, { service, town: 'other' }), label: 'Send a request anyway', townName: top.name },
  });
}

/**
 * Where an approximate pin sits on the outline map (src/service-area-geo.json), in viewBox units.
 * Returns null when the point is off the drawing.
 */
export function pinPosition(pin, geo) {
  if (!pin || !geo?.proj) return null;
  const { minX, maxY, k, scale, pad } = geo.proj;
  const x = (pin.lon - minX) * k * scale + pad;
  const y = (maxY - pin.lat) * scale + pad;
  const [, , w, h] = geo.viewBox;
  if (x < 0 || y < 0 || x > w || y > h) return null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}
