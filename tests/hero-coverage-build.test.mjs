// Build guards for the hero-options and ZIP-coverage work (runs on the normal production build: npm test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const page = (p) => readFileSync(join(dist, p.replace(/^\/|\/$/g, ''), 'index.html'), 'utf8');
const areas = JSON.parse(readFileSync(join(root, 'src/areas.json'), 'utf8'));
const confirmed = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8')).towns;

test('the production build has no review pages, and the sitemap never lists them', () => {
  assert.equal(existsSync(join(dist, 'review')), false);
  assert.doesNotMatch(readFileSync(join(dist, 'sitemap.xml'), 'utf8'), /review/);
});

test('the live home page keeps its search setup and drops the portrait Shane dislikes', () => {
  const home = page('/');
  assert.match(home, /<meta name="google-site-verification" content="T1fr6tjXPBeZCzYliQAi5NbFYg6pVZYkxTW6no-cVG4"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/smeredithplumbing\.com\/"/);
  assert.doesNotMatch(home, /noindex/);
  assert.doesNotMatch(home, /images\/shane/, 'no portrait on the home page');
  assert.match(home, /<h1[^>]*>The plumber who answers the phone\.<\/h1>/);
  assert.doesNotMatch(home, /@keyframes sm-/, 'no hero option motion ships on the live home page until one is chosen');
});

test('the ZIP checker is on the home and service-area pages with a no-JavaScript town picker beside it', () => {
  for (const p of ['/', '/service-area/']) {
    const html = page(p);
    assert.match(html, /data-zip-form/);
    assert.match(html, /inputmode="numeric"[^>]*autocomplete="postal-code"|autocomplete="postal-code"[^>]*inputmode="numeric"/);
    assert.doesNotMatch(html, /type="number"/, 'a number field would drop the leading zero');
    assert.match(html, /<noscript>[\s\S]*name="town"[\s\S]*tel:\+17818204592[\s\S]*<\/noscript>/);
    assert.match(html, /<noscript><style>\.js-only/);
  }
});

test('town pages stay crawlable through plain links on the home and service-area pages', () => {
  for (const p of ['/', '/service-area/']) {
    const html = page(p);
    for (const a of areas) assert.match(html, new RegExp(`href="/areas/${a.slug}/"`), `${p} links to ${a.slug}`);
  }
});

test('the ZIP data and the pin map are static files; the map shades only confirmed towns', () => {
  const data = JSON.parse(readFileSync(join(dist, 'data/zip-coverage.json'), 'utf8'));
  assert.ok(data.zips['01906'] && data.zips['02176']);
  assert.match(data.source, /Census/);
  const svg = readFileSync(join(dist, 'data/area-map.svg'), 'utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal((svg.match(/fill="#F6E4E2"/g) || []).length, confirmed.length);
  for (const t of confirmed) assert.ok(svg.includes(`>${t.name}</text>`), t.name);
  assert.doesNotMatch(svg, /<script/i);
});

test('proposed towns are never treated as confirmed anywhere in the build', () => {
  const proposed = JSON.parse(readFileSync(join(root, 'src/service-area-proposed.json'), 'utf8')).towns;
  const ld = [...page('/').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const served = ld.find((j) => j['@type'] === 'Plumber').areaServed.map((a) => a.name.replace(/, MA$/, ''));
  assert.deepEqual(served.sort(), confirmed.map((t) => t.name).sort(), 'schema areaServed is exactly the confirmed list');
  for (const t of proposed) {
    assert.ok(!served.includes(t.name), `${t.name} is not in schema`);
    assert.ok(!confirmed.some((c) => c.slug === t.slug), `${t.name} is not confirmed`);
  }
});

test('hero logo files are resized copies of the supplied logo (same proportions)', async () => {
  const sharp = (await import('sharp')).default;
  for (const w of [240, 360, 480, 720]) {
    for (const ext of ['avif', 'webp']) {
      const m = await sharp(join(dist, `images/logo-hero-${w}.${ext}`)).metadata();
      assert.equal(m.width, w);
      assert.ok(Math.abs(m.width / m.height - 720 / 710) < 0.01, `${w}.${ext} is ${m.width}x${m.height}`);
    }
  }
});
