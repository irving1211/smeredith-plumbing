// The redesigned pages in a real browser: the phone first screen, the short homepage, the new About / Work / Service area
// pages, the header menu, and the rules that keep contact actions reachable without covering content.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { launch, named, phoneContext, serve } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const services = JSON.parse(readFileSync(join(root, 'src/services.json'), 'utf8'));
const areas = JSON.parse(readFileSync(join(root, 'src/areas.json'), 'utf8'));
const reviews = JSON.parse(readFileSync(join(root, 'src/reviews.json'), 'utf8')).reviews;
let browser, server, origin;

before(async () => {
  ({ server, origin } = await serve(join(root, 'dist')));
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const ALL_PAGES = ['/', '/services/', ...services.map((s) => `/services/${s.slug}/`), ...areas.map((a) => `/areas/${a.slug}/`), '/about/', '/work/', '/service-area/', '/contact/', '/contact/thanks/', '/404.html'];

describe('home page on a phone', () => {
  test('the first screen shows what Shane does, the call and request actions, and the start of the service list', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const inFirstScreen = async (locator) => {
      const box = await locator.boundingBox();
      return !!box && box.y >= 0 && box.y + box.height <= 844;
    };
    assert.match(await page.locator('h1').textContent(), /The plumber who answers the phone\./);
    assert.equal(await inFirstScreen(page.locator('.home-hero').getByRole('link', { name: /^Call 781-820-4592$/ })), true, 'call is on the first screen');
    assert.equal(await inFirstScreen(page.locator('.home-hero').getByRole('link', { name: 'Request service' })), true, 'request is on the first screen');
    assert.equal(await inFirstScreen(page.locator('.vanlist .row-main').first()), true, 'the first service row is on the first screen');
    await context.close();
  });

  test('the whole page is short: at most seven phone screens (it was about twenty-nine)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.waitForTimeout(400);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.ok(height <= 7 * 844, `home is ${height}px tall at 390px wide`);
    await context.close();
  });

  test('every service row opens the request form with that service chosen, and has a details link; the tap is counted as an id only', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const rows = await page.locator('.vanlist li').evaluateAll((lis) => lis.map((li) => [li.querySelector('.row-main').getAttribute('href'), li.querySelector('.row-more').getAttribute('href')]));
    assert.deepEqual(rows.map((r) => r[0].replace('/contact/?service=', '')), ['water-heater-replacement', 'boiler-service', 'kitchen-bath-remodels', 'new-construction-plumbing', 'gas-installation', 'general-plumbing', 'emergency-plumbing']);
    for (const [, details] of rows) assert.ok(details === '/services/' || services.some((s) => details === `/services/${s.slug}/`), details);
    await page.locator('.vanlist .row-main').nth(1).click();
    await page.waitForURL(/contact\/\?service=boiler-service/);
    assert.equal(await page.locator('input[name="service_type"]:checked').getAttribute('value'), 'boiler-service');
    assert.deepEqual(named(events, 'request_form_click').map((e) => e.service_type), ['boiler-service']);
    await context.close();
  });

  test('the old in-page claims are gone from the homepage: no insurance, same-day, free-quote, callback or payment promises', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    for (const claim of [/fully insured/i, /licensed (&|and) insured/i, /same-day/i, /free (written )?(quotes?|estimates?)/i, /1-hour/i, /no dispatch fees/i, /venmo/i, /parts on the (truck|van)/i, /stocked van/i, /commercial/i]) {
      assert.doesNotMatch(text, claim, `unverified claim on the homepage: ${claim}`);
    }
    assert.match(text, /MA Lic\. 9630040-PL-M/);
    assert.match(text, /24\/7 emergency service/);
    await context.close();
  });
});

describe('contact actions stay reachable without covering anything', () => {
  for (const [label, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 900 }, false]]) {
    test(`on a ${label}, no page has a fixed bar floating over its content; every page has Call and Request in the header`, async () => {
      const { context } = await phoneContext(browser, { viewport, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      for (const path of ALL_PAGES) {
        await page.goto(`${origin}${path}`);
        const floating = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).position === 'fixed').map((el) => el.className || el.tagName));
        assert.deepEqual(floating, [], `${path} has fixed elements`);
        assert.equal(await page.locator('.site-header .header-call').isVisible(), true, `${path} header call`);
        if (!mobile) assert.equal(await page.locator('.site-header .header-request').isVisible(), true, `${path} header request`);
      }
      await context.close();
    });
  }
});

describe('layout holds at narrow and wide widths', () => {
  for (const width of [320, 390, 820, 1280]) {
    test(`no page scrolls sideways at ${width}px`, async () => {
      const { context } = await phoneContext(browser, { viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600 });
      const page = await context.newPage();
      for (const path of ALL_PAGES) {
        await page.goto(`${origin}${path}`);
        await page.waitForTimeout(100);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(over <= 0, `${path} overflows by ${over}px at ${width}px`);
      }
      await context.close();
    });
  }

  test('touch targets: every visible link, button and form control is at least 44px tall on a phone (inline text links are exempt)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const small = [];
    for (const path of ['/', '/contact/', '/about/', '/work/', '/service-area/', '/services/']) {
      await page.goto(`${origin}${path}`);
      await page.waitForTimeout(150);
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('a, button, summary, input:not([type=hidden]), select, textarea')]
          .filter((el) => el.offsetParent !== null && !el.closest('.hp') && !el.closest('p'))
          .map((el) => {
            // a radio is tapped through its whole label (tile or chip), so that is the target that counts
            const target = el.type === 'radio' ? el.closest('label') : el;
            const r = target.getBoundingClientRect();
            const own = el.getBoundingClientRect();
            return { el: (el.className || el.tagName) + ' ' + (el.textContent || el.name || '').trim().slice(0, 24), h: Math.round(r.height), w: Math.round(r.width), control: Math.round(Math.min(own.width, own.height)), radio: el.type === 'radio' };
          })
          .filter((x) => x.h > 0 && (x.h < 44 || (x.radio && x.control < 24))));
      for (const f of found) small.push(`${path} ${f.el} ${f.w}x${f.h}`);
    }
    assert.deepEqual(small, []);
    await context.close();
  });
});

describe('header menu on a phone', () => {
  test('opens from the Menu button, lists the pages and Request service, closes with Escape and when you tap away', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    assert.equal(await page.locator('.menu-panel').isVisible(), false);
    await page.click('.menu > summary');
    assert.equal(await page.locator('.menu-panel').isVisible(), true);
    assert.deepEqual(await page.locator('.menu-panel a').allTextContents(), ['Services', 'Our work', 'About Shane', 'Service area', 'Request service']);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.menu-panel').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'SUMMARY', 'focus returns to the Menu button');
    await page.click('.menu > summary');
    await page.mouse.click(200, 700);
    assert.equal(await page.locator('.menu-panel').isVisible(), false);
    await page.click('.menu > summary');
    await page.locator('.menu-panel').getByRole('link', { name: 'Our work' }).click();
    await page.waitForURL(/\/work\/$/);
    assert.equal(await page.locator('.menu-panel').isVisible(), false, 'the menu starts closed on the new page');
    await context.close();
  });

  test('on a desktop the page links are shown directly and the current section is marked', async () => {
    const { context } = await phoneContext(browser, { viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    const page = await context.newPage();
    await page.goto(`${origin}/about/`);
    assert.equal(await page.locator('.menu').isVisible(), false);
    assert.deepEqual(await page.locator('.header-nav a').allTextContents(), ['Services', 'Our work', 'About Shane', 'Service area']);
    assert.equal(await page.locator('.header-nav a[aria-current="page"]').textContent(), 'About Shane');
    await context.close();
  });
});

describe('the pages that took over the long homepage sections', () => {
  test('About: owner, license number, van, and every review exactly as stored', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/about/`);
    const text = await page.locator('main').innerText();
    assert.match(text, /master plumber license 9630040-PL-M/);
    assert.equal(await page.locator('[data-curated] .review-card').count(), reviews.length);
    for (const r of reviews) assert.ok(text.replace(/\s+/g, ' ').includes(r.body.replace(/\s+/g, ' ')), `review by ${r.name} is quoted verbatim`);
    assert.equal(await page.locator('img[alt*="van"]').count(), 1);
    await context.close();
  });

  test('Work: every job photo has alt text and loads, and each group links to its service with the service chosen', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/work/`);
    const imgs = await page.locator('main img').evaluateAll((els) => els.map((e) => ({ alt: e.alt, src: e.getAttribute('src') })));
    assert.ok(imgs.length >= 15);
    assert.deepEqual(imgs.filter((i) => !i.alt.trim()), []);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } });
    await page.waitForTimeout(600);
    const broken = await page.locator('main img').evaluateAll((els) => els.filter((e) => !e.complete || e.naturalWidth === 0).map((e) => e.getAttribute('src')));
    assert.deepEqual(broken, []);
    const links = await page.locator('main .group-actions .btn-primary').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert.deepEqual(links, ['/contact/?service=water-heater-replacement', '/contact/?service=boiler-service', '/contact/?service=kitchen-bath-remodels']);
    assert.equal(await page.locator('.photo-strip').first().getAttribute('tabindex'), '0', 'a scrolling photo row can be reached by keyboard');
    await context.close();
  });

  test('Service area: the checker, the outline map and a link for every town that has a page', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/service-area/`);
    assert.equal(await page.locator('#area-town option').count(), 15, 'prompt + 14 towns');
    assert.equal(await page.locator('svg.area-svg path.town').count(), 14);
    const links = await page.locator('.area-towns a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    assert.deepEqual(links.sort(), areas.map((a) => `/areas/${a.slug}/`).sort());
    await context.close();
  });

  test('home: the checker is compact (no map) and sends a confirmed town to the form with it filled in', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    assert.equal(await page.locator('#area svg').count(), 0);
    await page.selectOption('#area-town', 'revere');
    await page.locator('#area [data-area-cta]').click();
    await page.waitForURL(/\/contact\/\?town=revere$/);
    assert.equal(await page.inputValue('#address'), 'Revere');
    await context.close();
  });
});
