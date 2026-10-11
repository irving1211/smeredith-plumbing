// ZIP-first coverage checker: validation, honest states, no Yes without an owner-confirmed town.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkZip, parseZip, pinPosition, townsForZip, ZIP_STATES, SIGNIFICANT_SHARE } from '../src/lib/zip-coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(root, 'public/data/zip-coverage.json'), 'utf8'));
const geo = JSON.parse(readFileSync(join(root, 'src/service-area-geo.json'), 'utf8'));
const confirmed = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8')).towns;
const proposed = JSON.parse(readFileSync(join(root, 'src/service-area-proposed.json'), 'utf8')).towns;

test('leading zeroes survive and ZIP+4 is accepted; 4-digit and junk input is explained', () => {
  assert.deepEqual(parseZip('01906'), { ok: true, zip: '01906' });
  assert.deepEqual(parseZip(' 01906-1234 '), { ok: true, zip: '01906' });
  assert.deepEqual(parseZip('01906 1234'), { ok: true, zip: '01906' });
  assert.equal(parseZip('1906').reason, 'four_digits');
  assert.equal(parseZip('').reason, 'empty');
  for (const bad of ['0190', '019066', 'Saugus', '01906-12', '<b>01906</b>', '０１９０６']) assert.equal(parseZip(bad).ok, false, bad);
  assert.match(checkZip('1906', data).message, /start with 0/);
  assert.equal(checkZip('abc', data).state, 'invalid');
  assert.equal(checkZip('abc', data).primary, null, 'no action for invalid input');
});

test('the data is real Census geography for every confirmed town', () => {
  assert.ok(Object.keys(data.zips).length > 500, 'all Massachusetts ZCTAs');
  for (const zip of Object.keys(data.zips)) assert.match(zip, /^\d{5}$/);
  const covered = new Set(Object.values(data.zips).flatMap((r) => r.slice(2).filter((x) => typeof x === 'string')));
  for (const t of confirmed) assert.ok(covered.has(t.slug), `${t.slug} has at least one ZIP`);
  for (const t of proposed) assert.ok(data.towns[t.slug], `proposed town ${t.slug} exists in Census names`);
  assert.match(data.source, /Census/);
});

test('a confirmed town answers Yes and carries the service and verified town into the form', () => {
  const r = checkZip('01906', data, 'water-heater-replacement');
  assert.equal(r.state, 'covered');
  assert.equal(r.message, 'Yes — Shane serves Saugus.');
  assert.equal(r.primary.label, 'Yes — request service');
  assert.equal(r.primary.href, '/contact/?service=water-heater-replacement&town=saugus');
  assert.ok(!r.primary.href.includes('01906'), 'the ZIP is never put in a link');
  assert.match(r.note, /mostly Saugus, with part of Lynn/);
  assert.ok(r.pin && r.pin.lat > 42 && r.pin.lon < -70);
  assert.equal(checkZip('02176', data).primary.href, '/contact/?town=melrose');
  assert.equal(checkZip('02176', data, 'not-a-service').primary.href, '/contact/?town=melrose', 'unknown service ids are dropped');
  assert.equal(checkZip('02176', data, '', { base: '/x/' }).primary.href, '/x/contact/?town=melrose');
});

test('every ZIP whose significant towns are all confirmed says Yes (or confirm-area); nothing else ever says Yes', () => {
  const conf = new Set(confirmed.map((t) => t.slug));
  let yes = 0;
  for (const zip of Object.keys(data.zips)) {
    const r = checkZip(zip, data);
    assert.ok(ZIP_STATES.includes(r.state), `${zip} ${r.state}`);
    const sig = townsForZip(zip, data).towns.filter((t) => t.share >= SIGNIFICANT_SHARE);
    const all = sig.length && sig.every((t) => conf.has(t.slug));
    if (r.state === 'covered' || r.state === 'covered_check_area') { yes++; assert.ok(all, `${zip} said yes without confirmation`); }
    if (r.message.startsWith('Yes')) assert.equal(r.state, 'covered');
    if (all) assert.ok(['covered', 'covered_check_area'].includes(r.state), `${zip} is confirmed but answered ${r.state}`);
  }
  assert.ok(yes > 40, `${yes} covered ZIPs`);
});

test('Boston ZIPs ask for the neighborhood instead of promising every part of the city', () => {
  for (const zip of ['02129', '02110', '02132']) {
    const r = checkZip(zip, data, 'boiler-service');
    assert.equal(r.state, 'covered_check_area', zip);
    assert.match(r.message, /confirm your neighborhood/);
    assert.equal(r.primary.kind, 'call');
    assert.equal(r.secondary.href, '/contact/?service=boiler-service&town=boston');
  }
});

test('proposed and unknown towns are never refused: they get Call Shane to confirm', () => {
  const near = checkZip('01940', data); // Lynnfield
  assert.equal(near.state, 'nearby_confirm');
  assert.match(near.message, /Lynnfield isn't on Shane's confirmed list yet.*Call Shane to confirm/);
  assert.equal(near.primary.kind, 'call');
  assert.equal(near.secondary.href, '/contact/?town=other', 'no town or ZIP in the link');
  assert.equal(near.secondary.townName, 'Lynnfield');
  const far = checkZip('01001', data); // Agawam
  assert.equal(far.state, 'outside_confirm');
  assert.match(far.message, /Call to ask/);
  assert.doesNotMatch(far.message + far.note, /\bno\b|not served|don't serve|can't/i, 'never an absolute refusal');
});

test('a ZIP split between a confirmed and an unconfirmed town is "shared"', () => {
  const r = checkZip('01731', data, 'gas-installation');
  assert.equal(r.state, 'shared');
  assert.equal(r.primary.kind, 'call');
  assert.match(r.note, /Lexington is on Shane's list/);
  assert.equal(r.secondary.href, '/contact/?service=gas-installation&town=lexington');
});

test('slivers under the threshold do not turn a confirmed ZIP into a shared one', () => {
  const r = checkZip('01876', data); // Tewksbury 99%, Andover 1%
  assert.equal(r.state, 'covered');
  assert.doesNotMatch(r.message, /Andover/);
});

test('unknown ZIPs, out-of-state ZIPs and a failed lookup are handled honestly', () => {
  const po = checkZip('01999', data);
  assert.equal(po.state, 'not_found');
  assert.match(po.message, /PO box/);
  const nh = checkZip('03079', data);
  assert.equal(nh.state, 'not_found');
  assert.match(nh.message, /isn't a Massachusetts ZIP/);
  const down = checkZip('01906', null);
  assert.equal(down.state, 'lookup_error');
  assert.equal(down.retry, true);
  assert.match(down.primary.href, /^tel:/);
});

test('the approximate pin lands inside the map for local ZIPs and is dropped off the map', () => {
  const saugus = pinPosition(checkZip('01906', data).pin, geo);
  const [, , w, h] = geo.viewBox;
  assert.ok(saugus.x > 0 && saugus.x < w && saugus.y > 0 && saugus.y < h);
  // Saugus's ZIP centre is inside the Saugus outline's neighbourhood (label centroid within ~60 px)
  assert.ok(Math.hypot(saugus.x - geo.towns.saugus.cx, saugus.y - geo.towns.saugus.cy) < 60);
  assert.equal(pinPosition(checkZip('01001', data).pin, geo), null, 'western Mass is off the drawing');
  assert.equal(pinPosition(null, geo), null);
});

test('messages contain nothing the visitor typed except a validated 5-digit ZIP', () => {
  for (const input of ['<img src=x>', '01906<script>', "01906' or 1=1"]) {
    const r = checkZip(input, data);
    assert.equal(r.state, 'invalid');
    assert.doesNotMatch(r.message, /</);
  }
});
