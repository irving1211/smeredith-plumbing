// ZIP-first coverage checker in a real browser: answers, the approximate pin, carry-through into the request form,
// failure and retry, keyboard use, no-JavaScript fallback, accessibility, and privacy (the ZIP never leaves the page).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { launch, named, phoneContext, serve, serviceValue } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
let browser, server, origin;

before(async () => {
  ({ server, origin } = await serve(join(root, 'dist')));
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function check(page, zip, scope = '#area') {
  await page.fill(`${scope} [data-zip-input]`, zip);
  await page.press(`${scope} [data-zip-input]`, 'Enter');
  await page.waitForFunction((s) => {
    const m = document.querySelector(`${s} [data-area-message]`);
    return m && m.textContent && m.textContent !== 'Checking…';
  }, scope);
  return page.locator(`${scope} [data-area-result]`);
}

/** Everything the page could leak: analytics events, both storages and the URL. */
async function leaks(page, events) {
  return JSON.stringify({
    events,
    url: page.url(),
    local: await page.evaluate(() => JSON.stringify({ ...localStorage })),
    session: await page.evaluate(() => JSON.stringify({ ...sessionStorage })),
  });
}

describe('ZIP checker', () => {
  test('a confirmed ZIP answers Yes, shows an approximate pin and carries the verified town into the form', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    const mapRequests = [];
    page.on('request', (r) => { if (r.url().includes('/data/area-map.svg')) mapRequests.push(r.url()); });
    await page.goto(`${origin}/`);
    await page.waitForTimeout(300);
    assert.equal(mapRequests.length, 0, 'the map image is not downloaded until there is a pin to show');
    const result = await check(page, '01906');
    assert.equal(await result.locator('[data-area-message]').textContent(), 'Yes — Shane serves Saugus.');
    assert.match(await result.locator('[data-area-note]').textContent(), /ZIP 01906 is mostly Saugus, with part of Lynn/);
    const pinmap = result.locator('[data-pinmap]');
    assert.equal(await pinmap.isVisible(), true);
    assert.match(await pinmap.locator('[data-pin-caption]').textContent(), /approximate centre of ZIP 01906, not your address/);
    await page.waitForFunction(() => document.querySelector('[data-pinmap-img]').complete);
    assert.equal(mapRequests.length, 1);
    // the pin sits inside the visible frame
    const frame = await pinmap.locator('.pinmap-frame').boundingBox();
    const dot = await pinmap.locator('.pin-dot').boundingBox();
    assert.ok(dot.x > frame.x && dot.x + dot.width < frame.x + frame.width && dot.y > frame.y && dot.y + dot.height < frame.y + frame.height, 'pin is in view');
    const cta = result.locator('[data-area-cta]');
    assert.equal(await cta.textContent(), 'Yes — request service');
    assert.equal(await cta.getAttribute('href'), '/contact/?town=saugus');
    await page.waitForFunction(() => /Shane serves Saugus/.test(document.querySelector('#area [data-area-live]').textContent));
    await cta.click();
    await page.waitForURL(/\/contact\/\?town=saugus$/);
    assert.equal(await page.inputValue('#address'), 'Saugus', 'the verified town is filled in, once, in the existing town field');
    assert.equal(await page.locator('input[name="zip"]').count(), 0, 'no second, conflicting location field on the form');
    const checks = named(events, 'service_area_check');
    assert.deepEqual(checks.map((c) => [c.method, c.result, c.town]), [['zip', 'covered', undefined]]);
    const clicks = named(events, 'request_form_click');
    assert.equal(clicks.at(-1).town, undefined, 'a town found from a ZIP is not sent as an analytics parameter');
    assert.ok(!(await leaks(page, events)).includes('01906'), 'the ZIP is never in analytics, storage or a URL');
    await context.close();
  });

  test('on a service page the result carries the service as well as the town', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/services/boiler-service/`);
    const result = await check(page, '02176', '[data-area-checker]');
    assert.equal(await result.locator('[data-area-cta]').getAttribute('href'), '/contact/?service=boiler-service&town=melrose');
    await result.locator('[data-area-cta]').click();
    await page.waitForURL(/service=boiler-service&town=melrose/);
    assert.equal(await serviceValue(page), 'boiler-service');
    assert.equal(await page.inputValue('#address'), 'Melrose');
    await context.close();
  });

  test('a nearby, unconfirmed ZIP gets "Call Shane to confirm" first and an optional request, never a refusal', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/service-area/`);
    const result = await check(page, '01940');
    const text = await result.innerText();
    assert.match(text, /Lynnfield isn't on Shane's confirmed list yet, but it's near where he works\. Call Shane to confirm\./);
    assert.doesNotMatch(text, /^Yes|not served|don't serve|sorry|unable/im);
    const primary = result.locator('[data-area-cta]');
    assert.match(await primary.getAttribute('href'), /^tel:\+17818204592$/);
    assert.equal(await primary.textContent(), 'Call Shane to confirm');
    const second = result.locator('[data-area-call]');
    assert.equal(await second.textContent(), 'Send a request anyway');
    assert.equal(await page.locator('#area path.town.is-selected').count(), 0, 'nothing turns red for an unconfirmed town');
    await second.click();
    await page.waitForURL(/\/contact\/\?town=other$/);
    assert.equal(await page.inputValue('#address'), 'Lynnfield');
    assert.deepEqual(named(events, 'service_area_check').map((c) => c.result), ['nearby_confirm']);
    assert.ok(!(await leaks(page, events)).includes('01940'));
    await context.close();
  });

  test('Boston asks for the neighborhood; a far ZIP and an unknown ZIP still offer the call', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    let result = await check(page, '02129');
    assert.match(await result.locator('[data-area-message]').textContent(), /Boston is on Shane's list\. Call to confirm your neighborhood\./);
    assert.match(await result.locator('[data-area-cta]').getAttribute('href'), /^tel:/);
    assert.equal(await result.locator('[data-area-call]').getAttribute('href'), '/contact/?town=boston');
    result = await check(page, '01001');
    assert.match(await result.locator('[data-area-message]').textContent(), /outside the towns Shane usually covers\. Call to ask/);
    assert.equal(await result.locator('[data-pinmap]').isVisible(), false, 'no pin when the ZIP is off the map');
    result = await check(page, '01999');
    assert.match(await result.locator('[data-area-message]').textContent(), /couldn't place ZIP 01999/);
    assert.match(await result.locator('[data-area-cta]').getAttribute('href'), /^tel:/);
    assert.deepEqual(named(events, 'service_area_check').map((c) => c.result), ['covered_check_area', 'outside_confirm', 'not_found']);
    await context.close();
  });

  test('bad input is explained, marked invalid and focused, without downloading anything', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const dataRequests = [];
    page.on('request', (r) => { if (r.url().includes('/data/')) dataRequests.push(r.url()); });
    await page.goto(`${origin}/`);
    await page.evaluate(() => document.querySelector('#area [data-zip-input]').blur());
    const result = await check(page, '1906');
    assert.match(await result.locator('[data-area-message]').textContent(), /5 digits\. Massachusetts ZIP codes start with 0, like 01906\./);
    assert.equal(await page.getAttribute('#area [data-zip-input]', 'aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'area-zip');
    assert.equal(await result.locator('[data-area-cta]').isVisible(), false, 'no action for invalid input');
    assert.equal(await page.inputValue('#area [data-zip-input]'), '1906', 'what was typed is kept for correction');
    const ok = await check(page, '01906');
    assert.equal(await page.getAttribute('#area [data-zip-input]', 'aria-invalid'), null, 'cleared once corrected');
    assert.match(await ok.locator('[data-area-message]').textContent(), /^Yes/);
    await context.close();
  });

  test('if the lookup data cannot load, the visitor can retry, pick a town or call', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route('**/data/zip-coverage.json', (route) => route.abort());
    await page.goto(`${origin}/`);
    const result = await check(page, '01906');
    assert.match(await result.locator('[data-area-message]').textContent(), /lookup didn't load\. Try again, pick your town instead, or call Shane/);
    assert.match(await result.locator('[data-area-cta]').getAttribute('href'), /^tel:/);
    const retry = result.locator('[data-zip-retry]');
    assert.equal(await retry.isVisible(), true);
    await page.unroute('**/data/zip-coverage.json');
    await retry.click();
    await page.waitForFunction(() => /^Yes/.test(document.querySelector('#area [data-area-message]').textContent));
    assert.equal(await retry.isVisible(), false);
    await context.close();
  });

  test('if the lookup code itself cannot load, the visitor still gets the call option and a retry', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.route('**/_astro/zip-coverage*.js', (route) => route.abort());
    await page.goto(`${origin}/`);
    const result = await check(page, '01906');
    assert.match(await result.locator('[data-area-message]').textContent(), /lookup didn't load/);
    assert.match(await result.locator('[data-area-cta]').getAttribute('href'), /^tel:/);
    assert.equal(await result.locator('[data-zip-retry]').isVisible(), true);
    assert.deepEqual(named(events, 'service_area_check').map((c) => c.result), ['lookup_error']);
    await context.close();
  });

  test('keyboard only: tab to the ZIP box, type, press Enter, tab to the answer', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto(`${origin}/service-area/`);
    await page.focus('#area-zip');
    await page.keyboard.type('02148');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /Shane serves Malden/.test(document.querySelector('#area [data-area-message]').textContent));
    await page.keyboard.press('Tab'); // Check button
    await page.keyboard.press('Tab'); // first action in the result
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Yes — request service');
    await page.keyboard.press('Enter');
    await page.waitForURL(/town=malden/);
    await context.close();
  });

  test('without JavaScript there is a town picker and the phone number instead of the ZIP box', async () => {
    const { context } = await phoneContext(browser, { javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${origin}/service-area/`);
    assert.equal(await page.locator('#area [data-zip-form]').isVisible(), false);
    assert.equal(await page.locator('#area .area-manual').isVisible(), false, 'the JS-only picker is hidden too');
    assert.equal(await page.locator('#area-town-nojs').isVisible(), true);
    assert.match(await page.locator('#area .nojs-call a').getAttribute('href'), /^tel:/);
    await context.close();
  });

  test('town pages stay reachable through ordinary links (not only through the ZIP box)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    const links = await page.locator('#area .area-townlist a[href^="/areas/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    assert.deepEqual(links.sort(), ['/areas/lynn/', '/areas/malden/', '/areas/peabody/', '/areas/revere/', '/areas/saugus/']);
    await page.locator('#area .area-townlist summary').click();
    assert.equal(await page.locator('#area .area-townlist a[href="/areas/lynn/"]').isVisible(), true);
    await context.close();
  });

  test('axe: no serious or critical issues with a result, pin and both action styles showing', async () => {
    for (const zip of ['01906', '01940']) {
      const { context } = await phoneContext(browser);
      const page = await context.newPage();
      await page.goto(`${origin}/`);
      await check(page, zip);
      await page.addScriptTag({ path: axePath });
      const res = await page.evaluate(async () => (await window.axe.run(document.querySelector('#area'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] })).violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => v.id));
      assert.deepEqual(res, [], zip);
      for (const sel of ['#area [data-area-cta]', '#area [data-area-call]', '#area [data-zip-input]']) {
        const box = await page.locator(sel).boundingBox();
        assert.ok(box.height >= 44, `${sel} is ${box.height}px tall`);
      }
      await context.close();
    }
  });
});
