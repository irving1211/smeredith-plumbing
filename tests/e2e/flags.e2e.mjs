// Browser tests for the optional features, built with PUBLIC_GOOGLE_MAPS_KEY and PUBLIC_REVIEWS_LIVE set
// (a fake key: every Google request is intercepted, nothing real is contacted and nothing is billed).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { launch, named, phoneContext, serve } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'dist-e2e');
let browser, server, origin;

before(async () => {
  execFileSync(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', outDir], {
    cwd: root,
    env: { ...process.env, PUBLIC_GOOGLE_MAPS_KEY: 'TEST-KEY-NOT-REAL', PUBLIC_REVIEWS_LIVE: '1', PUBLIC_PRIVACY_PUBLISHED: '1' },
    stdio: 'ignore',
  });
  ({ server, origin } = await serve(outDir));
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

// A minimal stand-in for the Google Maps JS API surface the checker uses.
const MAPS_STUB = `
  window.__stub = { maps: [], features: [] };
  window.google = { maps: { importLibrary: async () => ({
    Map: class {
      constructor(el, opts) { this.el = el; this.opts = opts; window.__stub.maps.push(opts);
        this.data = { addGeoJson: (g) => { window.__stub.features = g.features.map((f) => f.properties.slug); },
          setStyle: (fn) => { window.__stub.style = fn; }, addListener: (_e, cb) => { window.__stub.click = cb; } }; }
    } }) } };
  window.__smMapsReady();
`;

describe('on-demand Google Map', () => {
  const MAPS = '**/maps.googleapis.com/**';

  test('with a key the button appears, but nothing is requested from Google until it is clicked', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const google = [];
    page.on('request', (r) => { if (r.url().includes('googleapis.com')) google.push(r.url()); });
    await page.goto(`${origin}/#area`);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-gmap-open]').isVisible(), true);
    assert.deepEqual(google, [], 'no Google request before the visitor asks for the map');
    await context.close();
  });

  test('if Google cannot be reached the visitor is told, the button recovers, and the checker keeps working', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route(MAPS, (route) => route.abort('failed'));
    await page.goto(`${origin}/#area`);
    await page.locator('[data-gmap-open]').click();
    await page.waitForFunction(() => /couldn't load/.test(document.querySelector('[data-gmap-status]').textContent));
    assert.equal(await page.locator('[data-gmap]').isHidden(), true);
    assert.equal(await page.locator('[data-gmap-open]').isEnabled(), true, 'they can try again');
    await page.selectOption('#area-town', 'revere');
    assert.match(await page.locator('#area [data-area-message]').textContent(), /Shane serves Revere/);
    assert.equal(named(events, 'service_area_map_error').length, 1);
    assert.equal(named(events, 'service_area_map_open').length, 1);
    await context.close();
  });

  test('a rejected key (billing off, wrong referrer) is reported the same way', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route(MAPS, (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.gm_authFailure && window.gm_authFailure();' }));
    await page.goto(`${origin}/#area`);
    await page.locator('[data-gmap-open]').click();
    await page.waitForFunction(() => /couldn't load/.test(document.querySelector('[data-gmap-status]').textContent));
    assert.equal(await page.locator('[data-gmap]').isHidden(), true);
    await context.close();
  });

  test('when Google loads, only confirmed towns are drawn, a click selects one, and the home address is never used', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const requested = [];
    await page.route(MAPS, (route) => { requested.push(route.request().url()); route.fulfill({ contentType: 'text/javascript', body: MAPS_STUB }); });
    await page.goto(`${origin}/#area`);
    await page.locator('[data-gmap-open]').click();
    await page.waitForFunction(() => window.__stub && window.__stub.features.length > 0);
    const stub = await page.evaluate(() => window.__stub);
    assert.deepEqual([...stub.features].sort(), ['boston', 'everett', 'haverhill', 'lexington', 'lynn', 'malden', 'melrose', 'peabody', 'revere', 'saugus', 'somerville', 'stoneham', 'tewksbury', 'wakefield']);
    assert.equal(stub.maps.length, 1);
    assert.deepEqual(stub.maps[0].center, { lat: 42.47, lng: -71.03 }, 'centred on the service area, not a street address');
    assert.equal(stub.maps[0].zoom, 10);
    assert.match(requested[0], /key=TEST-KEY-NOT-REAL/);
    assert.match(requested[0], /loading=async/);
    assert.equal(requested.length, 1);
    await page.evaluate(() => window.__stub.click({ feature: { getProperty: () => 'malden' } }));
    assert.equal(await page.inputValue('#area-town'), 'malden');
    assert.match(await page.locator('#area [data-area-message]').textContent(), /Shane serves Malden/);
    const opacity = await page.evaluate(() => [window.__stub.style({ getProperty: () => 'malden' }).fillOpacity, window.__stub.style({ getProperty: () => 'lynn' }).fillOpacity]);
    assert.ok(opacity[0] > opacity[1], 'the selected town is emphasised');
    await context.close();
  });

  test('the town boundary file the map uses contains only the confirmed towns', async () => {
    const response = await fetch(`${origin}/data/service-area.geojson`);
    assert.equal(response.status, 200);
    const geo = await response.json();
    assert.equal(geo.features.length, 14);
    assert.ok(geo.features.every((f) => f.geometry.type === 'Polygon' && f.geometry.coordinates[0].length > 8));
  });
});

describe('live Google reviews', () => {
  const API = '**/api/reviews';
  const sample = {
    status: 'ok', source: 'google-business-profile', fetchedAt: new Date().toISOString(), averageRating: 4.9, totalReviewCount: 33,
    reviews: [
      { name: 'Pat Q.', stars: 5, text: 'Fast and honest. <img src=x onerror="window.__xss=1"> <b>bold</b>', date: '2026-10-01' },
      { name: 'Sam R.', stars: 4, text: 'Good work, a little late.', date: '2026-09-02' },
    ],
  };

  test('reviews load as plain text with attribution; markup in a review is never interpreted', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route(API, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sample) }));
    await page.goto(`${origin}/#reviews`);
    await page.locator('[data-live-reviews]:not([hidden])').waitFor();
    const cards = page.locator('.live-card');
    assert.equal(await cards.count(), 2);
    assert.match(await cards.nth(0).textContent(), /Fast and honest\. <img src=x onerror="window\.__xss=1"> <b>bold<\/b>/);
    assert.match(await cards.nth(0).textContent(), /Pat Q\. · Oct 2026 · Google review/);
    assert.equal(await cards.nth(0).locator('img, b').count(), 0, 'no elements were created from review text');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await cards.nth(1).locator('.live-stars').getAttribute('aria-label'), '4 out of 5 stars', 'a 4-star review is shown as 4 stars');
    assert.match(await page.locator('[data-live-meta]').textContent(), /4\.9 out of 5 from 33 reviews on Google/);
    assert.match(await page.locator('.live-credit a').getAttribute('href'), /^https:\/\/share\.google\//);
    assert.match(await page.locator('.curated-h').textContent(), /hand-picked excerpts/);
    assert.deepEqual(named(events, 'reviews_live').map((e) => e.result), ['ok']);
    await context.close();
  });

  for (const [label, handler] of [
    ['credentials missing / API not approved', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'unavailable', reason: 'not_configured' }) })],
    ['upstream error', (route) => route.fulfill({ status: 500, body: 'oops' })],
    ['network failure', (route) => route.abort('failed')],
    ['malformed response', (route) => route.fulfill({ contentType: 'application/json', body: '{"status":"ok","reviews":"nope"}' })],
    ['empty list', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...sample, reviews: [] }) })],
  ]) {
    test(`unavailable (${label}): the section stays exactly as the hand-picked testimonials, with no error shown`, async () => {
      const { context, events } = await phoneContext(browser);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(API, handler);
      await page.goto(`${origin}/#reviews`);
      await page.waitForFunction(() => window.dataLayer.some((e) => e.event === 'reviews_live'), null, { timeout: 8000 });
      assert.equal(await page.locator('[data-live-reviews]').isHidden(), true);
      assert.equal(await page.locator('.live-card').count(), 0);
      assert.equal(await page.locator('.curated-h').count(), 0);
      assert.ok((await page.locator('[data-curated] .review-card').count()) >= 10, 'hand-picked testimonials are untouched');
      assert.deepEqual(errors, []);
      assert.deepEqual(named(events, 'reviews_live').map((e) => e.result), ['unavailable']);
      await context.close();
    });
  }

  test('the section is labelled so visitors can tell live Google reviews from hand-picked excerpts', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route(API, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sample) }));
    await page.goto(`${origin}/#reviews`);
    await page.locator('[data-live-reviews]:not([hidden])').waitFor();
    const text = await page.locator('#reviews').textContent();
    assert.match(text, /Latest reviews on Google/);
    assert.match(text, /Loaded from Google and shown as posted, newest first/);
    assert.match(text, /Hand-picked excerpts/);
    await context.close();
  });

  test('live reviews are not requested until the reviews section is near the viewport', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    let calls = 0;
    await page.route(API, (route) => { calls++; route.fulfill({ contentType: 'application/json', body: JSON.stringify(sample) }); });
    await page.goto(`${origin}/`);
    await page.waitForTimeout(500);
    assert.equal(calls, 0, 'not fetched during initial load');
    await page.locator('#reviews').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelectorAll('.live-card').length > 0);
    assert.equal(calls, 1);
    await context.close();
  });
});

test('no JSON-LD review markup is ever emitted, live reviews or not', async () => {
  const html = await (await fetch(`${origin}/`)).text();
  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    assert.doesNotMatch(block[1], /aggregateRating|"review"|"Review"/);
  }
});
describe('privacy notice follows the features that are built in', () => {
  const textOf = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');

  test('Maps and live-review paragraphs appear exactly when those features are built in; Analytics and Turnstile do not', async () => {
    const text = textOf(await (await fetch(`${origin}/privacy/`)).text());
    assert.ok(text.includes('Show interactive map'));
    assert.ok(text.includes('retrieved from Shane'));
    assert.ok(!text.includes('Google Analytics'));
    assert.ok(!text.includes('Cloudflare Turnstile'));
  });

  test('once published it is indexable, in the sitemap, and linked from the home page footer and the form', async () => {
    const html = await (await fetch(`${origin}/privacy/`)).text();
    assert.doesNotMatch(html, /name="robots" content="noindex/);
    assert.match(html, /<link rel="canonical" href="https:\/\/smeredithplumbing\.com\/privacy\/"/);
    assert.match(await (await fetch(`${origin}/sitemap.xml`)).text(), /<loc>https:\/\/smeredithplumbing\.com\/privacy\/<\/loc>/);
    assert.match(await (await fetch(`${origin}/`)).text(), /<a href="\/privacy\/"[^>]*>Privacy<\/a>/);
    assert.match(await (await fetch(`${origin}/contact/`)).text(), /<a href="\/privacy\/"[^>]*>Privacy notice<\/a>/);
  });
});
