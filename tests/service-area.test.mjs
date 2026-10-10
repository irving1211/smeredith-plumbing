// Coverage logic: one canonical town list, owner-confirmed towns get a CTA, everything else is "confirm with Shane" — never a rejection.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { checkTown, detectTowns, townBySlug, TOWNS } from '../src/lib/service-area.js';

const areas = JSON.parse(readFileSync(new URL('../src/areas.json', import.meta.url), 'utf8'));

test('the canonical list has exactly the 14 owner-approved towns, Saugus first', () => {
  assert.equal(TOWNS.length, 14);
  assert.equal(TOWNS[0].slug, 'saugus');
  assert.deepEqual(
    TOWNS.map((t) => t.name).sort(),
    ['Boston', 'Everett', 'Haverhill', 'Lexington', 'Lynn', 'Malden', 'Melrose', 'Peabody', 'Revere', 'Saugus', 'Somerville', 'Stoneham', 'Tewksbury', 'Wakefield'],
  );
});

test('every town that has its own page is in the canonical list', () => {
  for (const a of areas) assert.ok(townBySlug(a.slug), `${a.slug} page exists but town is not in the canonical list`);
});

test('a confirmed town returns a service-request CTA carrying town and service', () => {
  const r = checkTown('lynn', 'water-heater-replacement');
  assert.equal(r.status, 'confirmed');
  assert.equal(r.town.name, 'Lynn');
  assert.equal(r.cta.href, '/contact/?service=water-heater-replacement&town=lynn');
  assert.match(r.cta.label, /request service in lynn/i);
});

test('town-only and service-only links are well-formed', () => {
  assert.equal(checkTown('malden').cta.href, '/contact/?town=malden');
  assert.equal(checkTown('malden', 'not-a-service').cta.href, '/contact/?town=malden', 'unknown service ids are dropped, not echoed');
});

test('an unlisted town says "contact Shane to confirm", never a rejection', () => {
  const r = checkTown('andover');
  assert.equal(r.status, 'unlisted');
  assert.match(r.message, /contact shane to confirm availability/i);
  assert.doesNotMatch(r.message, /\b(not served|do not serve|don't serve|outside our|sorry|unable)\b/i);
  assert.ok(r.callHref.startsWith('tel:'));
  assert.equal(r.cta.href, '/contact/?town=other', 'a typed town is never placed in the URL');
  assert.equal(r.cta.typed, 'andover', 'the typed text is handed over separately (sessionStorage), not in the link');
  assert.match(r.cta.label, /contact shane/i);
});

test('free-text towns are encoded and length-limited when carried into the form', () => {
  const r = checkTown('Nowhere & <b>Bad</b> Town', 'boiler-service');
  assert.equal(r.status, 'unlisted');
  assert.ok(!r.cta.href.includes('<'), 'angle brackets must be percent-encoded');
  assert.equal(r.cta.href, '/contact/?service=boiler-service&town=other');
  assert.ok(!/Nowhere|Bad|%3C|<b>/.test(r.cta.href), 'nothing the visitor typed is in the link');
  assert.ok(!r.cta.typed.includes('\n') && r.cta.typed.length <= 60);
  assert.ok(checkTown('x'.repeat(300)).cta.href.length < 140);
});

test('a base path is honoured for preview deployments', () => {
  assert.equal(checkTown('lynn', 'boiler-service', { base: '/smeredith-plumbing/' }).cta.href, '/smeredith-plumbing/contact/?service=boiler-service&town=lynn');
});

test('empty input asks the visitor to pick a town instead of guessing', () => {
  assert.equal(checkTown('').status, 'choose');
  assert.equal(checkTown(undefined).status, 'choose');
});

test('free-text town names resolve case-insensitively, including "Lynn, MA" and "city of Lynn"', () => {
  for (const input of ['LYNN', ' lynn ', 'Lynn, MA', 'Lynn MA', 'city of Lynn', 'Town of Saugus']) {
    assert.equal(checkTown(input).status, 'confirmed', input);
  }
});

test('address detection prefers the locality segment over a street named after a town', () => {
  const d = detectTowns('123 Revere Beach Pkwy, Everett, MA 02149');
  assert.equal(d.primary, 'everett');
  assert.equal(d.confidence, 'segment');
});

test('address detection with no comma lists every mention and refuses to pick', () => {
  const d = detectTowns('45 Malden St Revere');
  assert.equal(d.primary, null);
  assert.deepEqual(d.matches.sort(), ['malden', 'revere']);
  assert.equal(d.confidence, 'mention');
});

test('an unlisted locality is never overridden by an earlier segment that happens to be a town', () => {
  const d = detectTowns('Lynn, Andover, MA');
  assert.equal(d.primary, null, 'the real locality (Andover) is not on the list, so no town is asserted');
  assert.deepEqual(d.matches, ['lynn']);
  assert.equal(d.confidence, 'mention');
});

test('text that mentions no listed town is reported as none', () => {
  assert.deepEqual(detectTowns('77 Elm St, Andover, MA'), { primary: null, matches: [], confidence: 'none' });
  assert.deepEqual(detectTowns(''), { primary: null, matches: [], confidence: 'none' });
});

test('town names inside other words do not match (no "Lynnfield" -> Lynn)', () => {
  assert.equal(detectTowns('Lynnfield, MA').confidence, 'none');
  assert.equal(detectTowns('Malden Bridge').matches.includes('malden'), true);
  assert.equal(detectTowns('Everettville').confidence, 'none');
});
