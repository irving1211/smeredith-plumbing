// Hero options (review build only: npm run test:review builds dist-review/ with PUBLIC_REVIEW_ROUTES=1).
// Each option must keep the same words and actions, show Shane's logo at its own proportions, keep Call and Request on
// the first phone screen, animate once and briefly (or not at all with reduced motion), not shift the layout, hide its
// drawings from assistive technology, pass axe, work without JavaScript and stay out of search.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { launch, serve } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist-review');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const OPTIONS = ['1', '2', '3', '4', '5'];
const H1 = 'The plumber who answers the phone.';
let browser, server, origin;

before(async () => {
  assert.ok(existsSync(join(dist, 'review', 'index.html')), 'run npm run build:review first');
  ({ server, origin } = await serve(dist));
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };

describe('hero options', () => {
  for (const id of OPTIONS) {
    test(`option ${id}: same copy and actions, unchanged logo, Call and Request on the first phone screen`, async () => {
      for (const [name, opts] of [['phone', phone], ['desktop', desktop]]) {
        const context = await browser.newContext(opts);
        const page = await context.newPage();
        await page.goto(`${origin}/review/hero-${id}/`, { waitUntil: 'networkidle' });
        const hero = page.locator('.home-hero');
        assert.equal(await page.locator('h1').count(), 1);
        assert.equal((await hero.locator('h1').textContent()).trim(), H1);
        assert.match(await hero.locator('.lede').textContent(), /^Owner-operated by Shane Meredith\. Plumbing, heating, gas & additions across Saugus, the North Shore & Boston\. 24\/7 emergency service\.$/);
        for (const [label, href] of [['Call 781-820-4592', /^tel:\+17818204592$/], ['Request service', /^\/contact\/$/]]) {
          const link = hero.getByRole('link', { name: label, exact: true });
          assert.match(await link.getAttribute('href'), href);
          const box = await link.boundingBox();
          assert.ok(box.height >= 44, `${name}: ${label} is ${box.height}px tall`);
          assert.ok(box.y + box.height <= opts.viewport.height, `${name}: ${label} ends at ${Math.round(box.y + box.height)}px, below the first screen`);
        }
        // Shane's logo, wherever it appears in the hero, is drawn at its own proportions (option 2 shows it on the van
        // in his photo instead). Visible logo copies only: the phone-only and desktop-only parts are display:none.
        const logos = await hero.locator('img').evaluateAll((imgs) => imgs
          .filter((img) => /logo-hero-\d+\.(avif|webp)/.test(img.currentSrc || img.src) && img.getClientRects().length)
          .map((img) => ({ w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, nat: img.naturalWidth })));
        if (id !== '2') assert.ok(logos.length >= 1, `${name}: the logo is in the hero`);
        for (const l of logos) {
          assert.ok(l.nat > 0, 'logo loaded');
          assert.ok(Math.abs(l.w / l.h - 720 / 710) < 0.02, `${name}: logo drawn at ${l.w}x${l.h}, not its own proportions`);
        }
        // Real photos only, all with alt text; the old portrait file is never used and only option 5 uses the portrait crop.
        for (const img of await hero.locator('img[src*="/images/hero/"]').all()) assert.ok((await img.getAttribute('alt')).length > 10, 'photos are described');
        assert.equal(await hero.locator('img[src*="images/shane"], source[srcset*="images/shane"]').count(), 0);
        if (id !== '5') assert.equal(await hero.locator('source[srcset*="hero/owner"]').count(), 0, 'no portrait outside option 5');
        for (const svg of await hero.locator('svg').all()) assert.equal(await svg.evaluate((el) => !!el.closest('[aria-hidden="true"]')), true, 'drawings are hidden from assistive technology');
        await context.close();
      }
    });

    test(`option ${id}: motion runs once (a pulse may repeat twice) and ends within 3.2 s; reduced motion shows the finished hero with no animation`, async () => {
      const context = await browser.newContext({ ...phone, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      await page.goto(`${origin}/review/hero-${id}/`);
      const timings = await page.evaluate(() => document.getAnimations().map((a) => {
        const t = a.effect.getComputedTiming();
        return { iterations: t.iterations, end: t.endTime };
      }));
      assert.ok(timings.length > 0, 'the option has its one-time movement');
      for (const t of timings) {
        assert.ok(Number.isFinite(t.iterations) && t.iterations <= 2, 'never loops');
        assert.ok(t.end <= 3200, `an animation ends at ${t.end} ms`);
      }
      await context.close();

      const still = await browser.newContext({ ...phone, reducedMotion: 'reduce' });
      const page2 = await still.newPage();
      await page2.goto(`${origin}/review/hero-${id}/`);
      assert.equal(await page2.evaluate(() => document.getAnimations().length), 0, 'no animation at all with reduced motion');
      await still.close();
    });

    test(`option ${id}: no layout shift while loading and animating; the heading and buttons never move`, async () => {
      const context = await browser.newContext({ ...phone, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${origin}/review/hero-${id}/`);
      const at = async () => page.evaluate(() => ['h1', '.home-hero .btn-primary'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)]; }));
      const early = await at();
      await page.waitForTimeout(1800);
      assert.deepEqual(await at(), early, 'heading and Call button stay put');
      const cls = await page.evaluate(() => window.__cls);
      assert.ok(cls < 0.01, `layout shift ${cls}`);
      await context.close();
    });

    test(`option ${id}: axe finds no serious or critical issues (moving and still)`, async () => {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ ...phone, reducedMotion });
        const page = await context.newPage();
        await page.goto(`${origin}/review/hero-${id}/`);
        await page.waitForTimeout(1600);
        await page.addScriptTag({ path: axePath });
        const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`));
        assert.deepEqual(res, [], reducedMotion);
        await context.close();
      }
    });

    test(`option ${id}: works without JavaScript and stays out of search`, async () => {
      const context = await browser.newContext({ ...phone, javaScriptEnabled: false });
      const page = await context.newPage();
      const response = await page.goto(`${origin}/review/hero-${id}/`);
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('.home-hero h1').isVisible(), true);
      assert.equal(await page.locator('.home-hero').getByRole('link', { name: 'Call 781-820-4592' }).isVisible(), true);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
      assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
      assert.equal(await page.locator('meta[name="google-site-verification"]').count(), 0, 'verification tag only on the real home page');
      assert.equal(await page.locator('script[type="application/ld+json"]').filter({ hasText: 'FAQPage' }).count(), 0, 'no FAQ markup on review copies');
      await context.close();
    });
  }

  test('the comparison page lists all five options with working phone and desktop previews, and is noindex', async () => {
    const context = await browser.newContext(desktop);
    const page = await context.newPage();
    await page.goto(`${origin}/review/`);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, follow');
    for (const id of OPTIONS) {
      const section = page.locator(`#option-${id}`);
      assert.equal(await section.locator('iframe').count(), 2);
      await section.scrollIntoViewIfNeeded();
      const frame = section.locator('iframe').first();
      await frame.evaluate((f) => new Promise((r) => (f.contentDocument?.readyState === 'complete' ? r() : f.addEventListener('load', r, { once: true }))));
      assert.equal(await frame.evaluate((f) => f.contentDocument.querySelector('.home-hero h1').textContent.trim()), H1);
    }
    assert.match(await page.locator('#option-5 .caveat').textContent(), /portrait/);
    await context.close();
  });

  test('review pages are never in the sitemap, and the production build has none', () => {
    assert.doesNotMatch(readFileSync(join(dist, 'sitemap.xml'), 'utf8'), /review/);
    if (existsSync(join(root, 'dist', 'index.html'))) assert.equal(existsSync(join(root, 'dist', 'review')), false, 'npm run build output has no /review/');
  });
});
