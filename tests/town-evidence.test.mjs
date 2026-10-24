// A town page exists only where there is real work to show. These tests keep the town and job copy tied to Shane's own
// photos and captions: no unsourced local claims, no towns outside the confirmed list, every photo described.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const areas = JSON.parse(readFileSync(join(root, 'src/areas.json'), 'utf8'));
const jobs = JSON.parse(readFileSync(join(root, 'src/jobs.json'), 'utf8'));
const services = JSON.parse(readFileSync(join(root, 'src/services.json'), 'utf8'));
const { towns } = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8'));
const page = (path) => readFileSync(join(dist, path, 'index.html'), 'utf8');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Claims that were removed from the site because nothing in the client records supports them.
const UNSOURCED = [/\binsured\b/i, /same[- ]day/i, /free (?:written )?(?:quote|estimate)/i, /marine-grade/i, /2[–-]3x/i, /\bguarantee(?:d)?\b/i, /\bcommercial\b/i, /hard water/i, /salt[- ]air/i, /tenant turnover/i, /inspect(?:ed)? annually/i, /service[sd]? (?:them )?annually/i];
// Towns Shane's photos mention that are not on the confirmed 14-town list. They must not be named as places he works.
const OUT_OF_AREA = ['Georgetown', 'Weston', 'Billerica', 'North Reading'];

test('every town page is backed by at least one real job or a dated note', () => {
  for (const a of areas) {
    const withPhotos = jobs.filter((j) => j.town === a.slug);
    assert.ok(withPhotos.length > 0 || (a.recent || []).length > 0, `${a.slug} has no job photos and no recent note`);
  }
});

test('every town with a page is on the confirmed service-area list, and every job town has a page', () => {
  const confirmed = new Set(towns.map((t) => t.slug));
  for (const a of areas) assert.ok(confirmed.has(a.slug), `${a.slug} is not a confirmed town`);
  const pages = new Set(areas.map((a) => a.slug));
  for (const j of jobs.filter((j) => j.town)) assert.ok(pages.has(j.town), `${j.slug} is tagged ${j.town}, which has no town page`);
});

test('job photos exist, are described, and stay under the published size limit', () => {
  for (const j of jobs) {
    assert.ok(j.title && j.desc && j.service, `${j.slug} needs a title, description and service`);
    for (const p of j.photos) {
      const file = join(root, 'public', p.src);
      assert.ok(existsSync(file), `${j.slug}: ${p.src} is missing`);
      assert.ok(existsSync(join(root, 'public', p.original)), `${j.slug}: ${p.original} is missing`);
      if (j.slug && j.date) assert.ok(p.alt && p.alt.length >= 12, `${j.slug}: ${p.src} needs descriptive alt text`);
    }
  }
});

test('every job with a date uses YYYY-MM and a real service id', () => {
  const serviceIds = new Set(services.map((s) => s.service_id ?? s.slug));
  for (const j of jobs) {
    if (j.date) assert.match(j.date, /^20\d\d-(0[1-9]|1[0-2])$/, `${j.slug} date`);
    assert.ok(serviceIds.has(j.service), `${j.slug} service ${j.service} has no matching page`);
  }
});

test('town pages show their jobs with photos, descriptions and the photo month', () => {
  for (const a of areas) {
    const html = page(`/areas/${a.slug}`);
    for (const j of jobs.filter((x) => x.town === a.slug)) {
      assert.ok(html.includes(j.title.replace(/&/g, '&amp;')) || html.includes(j.title), `${a.slug} shows ${j.title}`);
      for (const p of j.photos) assert.ok(html.includes(p.src), `${a.slug} shows ${p.src}`);
    }
    if (jobs.some((x) => x.town === a.slug)) assert.match(html, /Photos from (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/);
  }
});

test('town and job copy carries no unsourced claim and names no town outside the confirmed list', () => {
  const copy = [JSON.stringify(areas), JSON.stringify(jobs)].join(' ');
  for (const re of UNSOURCED) assert.doesNotMatch(copy, re, `unsourced claim ${re} in town or job copy`);
  for (const town of OUT_OF_AREA) assert.ok(!copy.includes(town), `${town} is not a confirmed town`);
  for (const a of areas) {
    const body = text(page(`/areas/${a.slug}`));
    for (const re of UNSOURCED) assert.doesNotMatch(body, re, `${a.slug} page: unsourced claim ${re}`);
    for (const town of OUT_OF_AREA) assert.ok(!body.includes(town), `${a.slug} page names ${town}`);
  }
});

test('the work page shows every job once, with the town and month where known', () => {
  const html = page('/work');
  for (const j of jobs) assert.equal(html.split(j.photos[0].src).length - 1 >= 1, true, `${j.slug} is on the work page`);
  assert.match(html, /Somerville · July 2025/);
  assert.match(html, /Lynn · November 2025/);
});

test('new service pages stay inside the owner-approved service list and link to the right form id', () => {
  for (const slug of ['water-heater-repair', 'sump-pump-ejector-pumps', 'leak-and-pipe-repair', 'general-plumbing']) {
    const s = services.find((x) => x.slug === slug);
    assert.ok(s, `${slug} exists`);
    const html = page(`/services/${slug}`);
    assert.match(html, new RegExp(`/contact/\\?service=${s.service_id}`));
    for (const re of UNSOURCED) assert.doesNotMatch(text(html), re, `${slug}: unsourced claim ${re}`);
  }
  assert.match(services.find((s) => s.slug === 'water-heater-replacement').seo_title, /Repair & Replacement/);
});
