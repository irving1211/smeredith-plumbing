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

test('the live home page keeps its search setup and uses the chosen Incoming call hero', () => {
  const home = page('/');
  assert.match(home, /<meta name="google-site-verification" content="T1fr6tjXPBeZCzYliQAi5NbFYg6pVZYkxTW6no-cVG4"/);
  assert.match(home, /<link rel="canonical" href="https:\/\/smeredithplumbing\.com\/"/);
  assert.doesNotMatch(home, /noindex/);
  assert.doesNotMatch(home, /images\/shane(?:-640)?\.(?:jpg|webp)/, 'the old full-size portrait files are not used');
  assert.match(home, /data-hero="1"/, 'Incoming call hero');
  assert.match(home, /class="hc-banner-call" href="tel:\+17818204592"/);
  assert.match(home, /images\/hero\/shane-\d+\.(?:avif|webp)/, 'Meet Shane shows his photo');
  assert.match(home, /<h1[^>]*>The plumber who answers the phone\.<\/h1>/);
  assert.doesNotMatch(home, /@keyframes (?:sm|hb|hm|hr|ho)-/, 'only the chosen hero\'s CSS ships on the live home page');
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

test('no page repeats unsourced promises (insurance, same-day, free quotes, stocked truck, visit frequency) outside verbatim customer quotes', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) files.push(p); } };
  walk(dist);
  const claims = [/fully insured/i, /licensed (&|&amp;|and) insured/i, /same[- ]day/i, /free (written )?(quotes?|estimates?)/i, /1-hour/i, /no dispatch fee/i, /parts on the (truck|van)/i, /stocked van|stocks the truck/i, /\bweekly\b/i, /in dozens of/i];
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      // Customers' own words, quoted as written, with the caption that names the reviewer and their visit.
      .replace(/<figure class="quote review-card"[\s\S]*?<\/figure>/g, ' ')
      .replace(/<blockquote[\s\S]*?<\/blockquote>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const claim of claims) assert.doesNotMatch(text, claim, `${file.slice(dist.length)} still says ${claim}`);
  }
});
