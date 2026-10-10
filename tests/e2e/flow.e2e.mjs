// Browser regression tests against the default build (no third-party keys): service and town carry-through,
// the coverage checker, attribution, successful/failed submission, duplicate-conversion prevention.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { fillForm, launch, LEAD_ID, named, phoneContext, serve } from './helpers.mjs';

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

const field = (body, name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1];
const okJson = (svc = 'general-plumbing', src = 'direct_or_unknown', ha = '') => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, leadId: LEAD_ID, redirect: `${origin}/contact/thanks/?lead=${LEAD_ID}&svc=${svc}&src=${src}${ha ? `&ha=${ha}` : ''}` }),
});

async function mockContact(page, handler) {
  const seen = [];
  await page.route('**/api/contact', async (route) => {
    seen.push({ body: route.request().postData() || '', headers: route.request().headers() });
    await handler(route, seen.length);
  });
  return seen;
}

describe('service and town carry-through', () => {
  test('a service page CTA opens the form with that service selected, and the visitor can change it', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const seen = await mockContact(page, (route) => route.fulfill(okJson('other')));
    await page.goto(`${origin}/services/boiler-service/`);
    await page.getByRole('link', { name: 'Request service online' }).click();
    await page.waitForURL(/\/contact\/\?service=boiler-service$/);
    assert.equal(await page.inputValue('#service_type'), 'boiler-service');
    assert.equal(await page.locator('#prefill-note').isVisible(), true, 'visitor is told it was pre-filled');
    await page.selectOption('#service_type', 'other');
    await fillForm(page);
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'service_type'), 'other', 'the submitted service is what the visitor ended with');
    await context.close();
  });

  test('every service page carries its own id into the form', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    for (const id of ['emergency-plumbing', 'water-heater-replacement', 'boiler-service', 'gas-installation', 'kitchen-bath-remodels', 'new-construction-plumbing']) {
      await page.goto(`${origin}/services/${id}/`);
      await page.locator('.hero-cta').getByRole('link', { name: 'Request service online' }).click();
      await page.waitForURL(`**/contact/?service=${id}`);
      assert.equal(await page.inputValue('#service_type'), id, id);
    }
    await context.close();
  });

  test('a town page carries the town into the form', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/areas/lynn/`);
    await page.locator('.hero-alt').getByRole('link').click();
    await page.waitForURL(/\/contact\/\?town=lynn$/);
    assert.equal(await page.inputValue('#address'), 'Lynn');
    await context.close();
  });

  test('tampered or unknown query values are ignored safely', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/?service=%3Cscript%3E&town=%3Cb%3Ex%3C%2Fb%3E&town_other=${'x'.repeat(200)}`);
    assert.equal(await page.inputValue('#service_type'), 'general-plumbing');
    assert.equal((await page.inputValue('#address')).length, 60, 'free-text town is capped');
    assert.equal(await page.locator('#address').evaluate((el) => el.value.includes('<')), false);
    await context.close();
  });

  test('picking Emergency tells the visitor to call; other services do not', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/`);
    assert.equal(await page.locator('#emergency-note').isVisible(), false);
    await page.selectOption('#service_type', 'emergency-plumbing');
    assert.equal(await page.locator('#emergency-note').isVisible(), true);
    assert.match(await page.locator('#emergency-note a').getAttribute('href'), /^tel:\+17818204592$/);
    await page.selectOption('#service_type', 'boiler-service');
    assert.equal(await page.locator('#emergency-note').isVisible(), false);
    await context.close();
  });

  test('phone, text and form options are all visible on a phone without scrolling the form', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/`);
    for (const name of [/Call 781-820-4592/, /Text photos/]) {
      const link = page.locator('.quick-contact').getByRole('link', { name });
      assert.equal(await link.isVisible(), true);
      const box = await link.boundingBox();
      assert.ok(box.height >= 44, `tap target is ${box.height}px tall`);
    }
    await page.goto(`${origin}/services/water-heater-replacement/`);
    const hero = page.locator('.page-hero .hero-cta');
    for (const name of [/Call 781-820-4592/, /Text photos to Shane/, /Request service online/]) assert.equal(await hero.getByRole('link', { name }).isVisible(), true);
    await context.close();
  });
});

describe('service-area checker', () => {
  test('a confirmed town gets a clear request CTA that carries the town (and the service on service pages)', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/#area`);
    await page.selectOption('#area-town', 'lynn');
    const result = page.locator('#area [data-area-result]');
    assert.equal(await result.isVisible(), true);
    assert.match(await result.locator('[data-area-message]').textContent(), /Yes — Shane serves Lynn\./);
    const cta = result.locator('[data-area-cta]');
    assert.equal(await cta.getAttribute('href'), '/contact/?town=lynn');
    assert.match(await cta.textContent(), /Request service in Lynn/);
    assert.equal(await page.locator('#area path.town.is-selected').getAttribute('data-town'), 'lynn');
    assert.equal(await result.getAttribute('role'), 'status', 'result is announced to screen readers');
    await cta.click();
    await page.waitForURL(/\/contact\/\?town=lynn$/);
    assert.equal(await page.inputValue('#address'), 'Lynn');

    await page.goto(`${origin}/services/boiler-service/`);
    await page.selectOption('#svc-area-town', 'malden');
    assert.equal(await page.locator('[data-area-cta]').getAttribute('href'), '/contact/?service=boiler-service&town=malden');

    const checks = named(events, 'service_area_check');
    assert.deepEqual(checks.map((c) => [c.town, c.result]), [['lynn', 'confirmed'], ['malden', 'confirmed']]);
    await context.close();
  });

  test('an unlisted town is told to contact Shane — never rejected — and typed text is not sent to analytics', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/#area`);
    await page.fill('#area-other', 'Andover');
    await page.press('#area-other', 'Enter');
    const result = page.locator('#area [data-area-result]');
    const text = await result.innerText();
    assert.match(text, /Contact Shane to confirm availability in Andover/);
    assert.doesNotMatch(text, /not served|don't serve|sorry|unable|outside our/i);
    assert.equal(await result.locator('[data-area-cta]').getAttribute('href'), '/contact/?town=other', 'the typed town is not in the link');
    assert.equal(await page.locator('#area path.town.is-selected').count(), 0, 'nothing is highlighted as served');
    assert.match(await result.locator('[data-area-call]').getAttribute('href'), /^tel:/);
    await result.locator('[data-area-cta]').click();
    await page.waitForURL(/\/contact\/\?town=other$/);
    assert.ok(!page.url().includes('Andover'), 'the typed town never appears in a URL');
    assert.equal(await page.inputValue('#address'), 'Andover');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('sm_town_other')), null, 'handed over once, then cleared');
    const checks = named(events, 'service_area_check');
    assert.deepEqual(checks.map((c) => [c.town, c.result]), [['other', 'unlisted']]);
    assert.ok(!JSON.stringify(events).includes('Andover'), 'typed town never reaches analytics');
    await context.close();
  });

  test('keyboard only: the select works with arrow keys and the result follows', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/#area`);
    await page.focus('#area-town');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.inputValue('#area-town'), 'lynn');
    assert.match(await page.locator('#area [data-area-message]').innerText(), /Shane serves Lynn/);
    await context.close();
  });

  test('clicking a town on the map selects it', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/#area`);
    await page.locator('#area path.town[data-town="malden"]').dispatchEvent('click');
    assert.equal(await page.inputValue('#area-town'), 'malden');
    assert.match(await page.locator('#area [data-area-message]').textContent(), /Shane serves Malden/);
    await context.close();
  });

  test('Boston carries its "confirm your neighborhood" note', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/#area`);
    await page.selectOption('#area-town', 'boston');
    assert.match(await page.locator('#area [data-area-note]').textContent(), /confirm your neighborhood/i);
    await context.close();
  });

  test('without JavaScript the checker still works: it opens the request form with the town carried', async () => {
    const { context } = await phoneContext(browser, { javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.selectOption('#area-town', 'peabody');
    await page.locator('#area').getByRole('button', { name: 'Check my town' }).click();
    await page.waitForURL(/\/contact\/\?town=peabody/);
    assert.match(page.url(), /town=peabody/);
    await context.close();
  });

  test('there is no interactive Google map (and no Google request) unless a Maps key was built in', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) external.push(r.url()); });
    await page.goto(`${origin}/#area`);
    await page.waitForTimeout(500);
    assert.equal(await page.locator('[data-gmap-open]').count(), 0);
    assert.deepEqual(external, []);
    await context.close();
  });
});

describe('attribution', () => {
  test('first touch is preserved, a later campaign is kept separately, referrer query strings are dropped', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const seen = await mockContact(page, (route) => route.fulfill(okJson()));
    await page.goto(`${origin}/services/boiler-service/?utm_source=google-business-profile&utm_medium=organic&utm_campaign=gbp-website`, { referer: 'https://www.google.com/search?q=private+terms' });
    await page.goto(`${origin}/areas/lynn/?utm_source=facebook&utm_medium=social&utm_campaign=bio`);
    await page.goto(`${origin}/contact/`);
    const hidden = async (name) => page.locator(`input[name="${name}"]`).inputValue();
    assert.equal(await hidden('utm_source'), 'google-business-profile');
    assert.equal(await hidden('utm_medium'), 'organic');
    assert.equal(await hidden('utm_campaign'), 'gbp-website');
    assert.equal(await hidden('landing_page'), '/services/boiler-service/');
    assert.equal(await hidden('referrer'), 'https://www.google.com/search', 'external referrer kept as origin + path only (search terms dropped)');
    assert.equal(await hidden('latest_utm_source'), 'facebook');
    assert.equal(await hidden('latest_utm_medium'), 'social');
    assert.equal(await hidden('latest_utm_campaign'), 'bio');
    await fillForm(page);
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'utm_source'), 'google-business-profile');
    assert.equal(field(seen[0].body, 'latest_utm_source'), 'facebook');
    await context.close();
  });

  test('a visit with no tag and no referrer submits empty attribution (never invented)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/`);
    for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'latest_utm_source']) {
      assert.equal(await page.locator(`input[name="${name}"]`).inputValue(), '', name);
    }
    assert.equal(await page.locator('input[name="landing_page"]').inputValue(), '/contact/');
    await context.close();
  });

  test('re-landing on the same tag does not create a "later campaign"', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/?utm_source=facebook&utm_medium=social`);
    await page.goto(`${origin}/services/?utm_source=facebook&utm_medium=social`);
    await page.goto(`${origin}/contact/`);
    assert.equal(await page.locator('input[name="latest_utm_source"]').inputValue(), '');
    await context.close();
  });
});

describe('submission outcomes and conversion counting', () => {
  test('success: exactly one lead is counted, with enumerated parameters and no personal data; refresh and revisits never recount', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    const seen = await mockContact(page, (route) => route.fulfill(okJson('water-heater-replacement', 'gbp_tagged', 'google-maps')));
    await page.goto(`${origin}/contact/?service=water-heater-replacement`);
    await page.selectOption('#heard_about', 'google-maps');
    const v = await fillForm(page, { name: 'Zelda Private', phone: '617-555-0199', message: 'Private message text' });
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    await page.waitForTimeout(250);

    assert.match(seen[0].headers.accept, /application\/json/);
    assert.equal(field(seen[0].body, 'service_type'), 'water-heater-replacement');
    assert.equal(field(seen[0].body, 'heard_about'), 'google-maps');
    assert.equal(field(seen[0].body, 'name'), v.name);

    const leads = named(events, 'generate_lead');
    assert.equal(leads.length, 1);
    assert.equal(leads[0].service_type, 'water-heater-replacement');
    assert.equal(leads[0].lead_source, 'gbp_tagged');
    assert.equal(leads[0].heard_about, 'google-maps');
    const wire = JSON.stringify(events);
    for (const secret of ['Zelda', '617-555-0199', 'Private message', LEAD_ID]) assert.ok(!wire.includes(secret), `analytics leaked ${secret}`);
    assert.equal(new URL(page.url()).search, '', 'identifiers are stripped from the address bar');

    await page.reload();
    await page.waitForTimeout(200);
    assert.equal(named(events, 'generate_lead').length, 1, 'refresh does not recount');

    await page.goto(`${origin}/contact/thanks/?lead=${LEAD_ID}&svc=other&src=direct_or_unknown`);
    await page.waitForTimeout(200);
    assert.equal(named(events, 'generate_lead').length, 1, 'the same lead id is never counted twice (same tab)');

    const second = await context.newPage();
    await second.goto(`${origin}/contact/thanks/?lead=${LEAD_ID}&svc=other&src=direct_or_unknown`);
    await second.waitForTimeout(200);
    assert.equal(named(events, 'generate_lead').length, 1, '...nor in another tab on the same device');
    await context.close();
  });

  test('visiting the thank-you page without a server-issued lead id counts nothing', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    for (const url of ['/contact/thanks/', '/contact/thanks/?lead=not-a-uuid', '/contact/thanks/?lead=']) {
      await page.goto(`${origin}${url}`);
      await page.waitForTimeout(150);
    }
    assert.equal(named(events, 'generate_lead').length, 0);
    await context.close();
  });

  test('analytics values from the URL are whitelisted to plain ids (no injection into events)', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/thanks/?lead=${LEAD_ID.replace('4', '5')}&svc=${encodeURIComponent('<b>Zelda 617-555-0199</b>')}&src=ok_value`);
    await page.waitForTimeout(200);
    const lead = named(events, 'generate_lead')[0];
    assert.equal(lead.service_type, '');
    assert.equal(lead.lead_source, 'ok_value');
    await context.close();
  });

  test('failed delivery: honest message, answers kept, offers call/text/email, nothing counted, button usable again', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    await mockContact(page, (route) => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'delivery' }) }));
    await page.goto(`${origin}/contact/`);
    await fillForm(page, { message: 'Boiler is leaking at the relief valve' });
    await page.click('#submit-btn');
    const status = page.locator('#form-status');
    await status.waitFor({ state: 'visible' });
    const text = await status.innerText();
    assert.match(text, /did not go through, and Shane has not received it/);
    assert.match(text, /Your answers are still in the form/);
    assert.equal(await page.inputValue('#message'), 'Boiler is leaking at the relief valve');
    assert.equal(await page.inputValue('#phone'), '617-555-0142');
    assert.equal(await page.locator('#submit-btn').isEnabled(), true);
    assert.equal(await status.getAttribute('role'), 'alert');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'form-status', 'focus moves to the message');
    const actions = status.locator('#form-status-actions');
    assert.match(await actions.getByRole('link', { name: /Call/ }).getAttribute('href'), /^tel:/);
    assert.match(await actions.getByRole('link', { name: /Text/ }).getAttribute('href'), /^sms:/);
    const mailto = decodeURIComponent(await actions.getByRole('link', { name: /Email/ }).getAttribute('href'));
    assert.match(mailto, /^mailto:shane@smeredithplumbing\.com/);
    assert.match(mailto, /Boiler is leaking at the relief valve/);
    await page.waitForTimeout(200);
    assert.equal(named(events, 'generate_lead').length, 0, 'a failure is never a lead');
    assert.equal(named(events, 'form_submit_attempt').length, 1);
    const err = named(events, 'form_error');
    assert.deepEqual(err.map((e) => e.error_type), ['delivery']);
    assert.ok(!JSON.stringify(events).includes('Boiler is leaking'), 'no message text in analytics');
    await context.close();
  });

  test('network failure and server validation errors are reported accurately', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await context.newPage();
    let mode = 'abort';
    await page.route('**/api/contact', (route) => (mode === 'abort' ? route.abort('failed') : route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'validation' }) })));
    await page.goto(`${origin}/contact/`);
    await fillForm(page);
    await page.click('#submit-btn');
    await page.locator('#form-status').waitFor({ state: 'visible' });
    assert.match(await page.locator('#form-status-text').innerText(), /could not reach the server, so your request has not been sent/);
    mode = 'validation';
    await page.click('#submit-btn');
    await page.waitForFunction(() => /needs another look/.test(document.getElementById('form-status-text').textContent));
    assert.equal(await page.locator('#form-status-actions').isHidden(), true, 'validation errors do not push call/text/email');
    assert.deepEqual(named(events, 'form_error').map((e) => e.error_type), ['network', 'validation']);
    assert.equal(named(events, 'generate_lead').length, 0);
    await context.close();
  });

  test('double-clicking submit sends one request', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const seen = await mockContact(page, async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.fulfill(okJson());
    });
    await page.goto(`${origin}/contact/`);
    await fillForm(page);
    await page.dblclick('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(seen.length, 1);
    await context.close();
  });

  test('without JavaScript the form still posts natively and the server redirect lands on the thank-you page', async () => {
    const { context } = await phoneContext(browser, { javaScriptEnabled: false });
    const page = await context.newPage();
    const seen = await mockContact(page, (route) => route.fulfill({ status: 303, headers: { location: `${origin}/contact/thanks/?lead=${LEAD_ID}&svc=boiler-service&src=direct_or_unknown` } }));
    await page.goto(`${origin}/contact/`);
    await page.selectOption('#service_type', 'boiler-service');
    await fillForm(page);
    await page.waitForTimeout(1000); // smooth-scroll settles; Playwright's stability check cannot tick without JS
    await page.click('#submit-btn', { force: true });
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'service_type'), 'boiler-service');
    assert.doesNotMatch(seen[0].headers.accept || '', /application\/json/);
    assert.match(await page.locator('main').innerText(), /Your service request has been sent to Shane/);
    await context.close();
  });

  test('server-side error redirects (no-JS path) show an honest message that does not claim answers were kept', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/contact/?status=delivery`);
    const text = await page.locator('#form-status').innerText();
    assert.match(text, /has not received it/);
    assert.doesNotMatch(text, /still in the form/);
    await context.close();
  });
});

describe('accessibility (axe, WCAG 2 A/AA + best practice)', () => {
  const IGNORED = new Set(['region']); // floating call button sits outside a landmark by design
  for (const path of ['/', '/contact/', '/contact/thanks/', '/services/', '/services/boiler-service/', '/areas/lynn/']) {
    test(`no serious or critical violations on ${path}`, async () => {
      const { context } = await phoneContext(browser);
      const page = await context.newPage();
      await page.goto(`${origin}${path}`);
      // render and reveal every section (off-screen ones are intentionally skipped/transparent until scrolled to)
      await page.evaluate(() => { document.documentElement.classList.add('cv-off'); document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-visible')); });
      await page.waitForTimeout(1200); // let the 0.7 s reveal transition finish; text sampled mid-fade reads as low contrast
      await page.addScriptTag({ path: axePath });
      const results = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }));
      // Faint decorative service numerals (aria-hidden watermark digits) are exempt as pure decoration.
      const nodesOf = (v) => v.nodes.filter((n) => !(v.id === 'color-contrast' && n.target.join(' ').includes('.service-num')));
      const bad = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact) && !IGNORED.has(v.id) && nodesOf(v).length);
      assert.deepEqual(bad.map((v) => `${v.id}: ${nodesOf(v).slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), []);
      await context.close();
    });
  }
});

describe('scrolling stability (content-visibility placeholders)', () => {
  for (const [label, width, height] of [['phone', 390, 844], ['tablet', 820, 1100], ['desktop', 1280, 900]]) {
    test(`scrolling the whole homepage on a ${label} causes no meaningful layout shift`, async () => {
      const { context } = await phoneContext(browser, { viewport: { width, height }, isMobile: width < 600, hasTouch: width < 600 });
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.__cls = 0;
        new PerformanceObserver((list) => list.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
      });
      await page.goto(`${origin}/`);
      await page.waitForTimeout(600);
      let last = -1;
      for (let i = 0; i < 80; i++) {
        const y = await page.evaluate((step) => { window.scrollBy({ top: step, behavior: 'instant' }); return window.scrollY; }, Math.round(height * 0.7));
        await page.waitForTimeout(120);
        if (y === last) break;
        last = y;
      }
      await page.waitForTimeout(700);
      const cls = await page.evaluate(() => window.__cls);
      assert.ok(cls < 0.1, `cumulative layout shift while scrolling was ${cls.toFixed(3)} (limit 0.1)`);
      await context.close();
    });
  }

  test('in-page navigation lands on the right section even though sections below the fold are lazily laid out', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    await page.goto(`${origin}/`);
    await page.locator('.mobile-menu-link[href="#faq"]').evaluate((el) => el.click());
    await page.waitForTimeout(1800);
    const top = await page.evaluate(() => Math.round(document.getElementById('faq').getBoundingClientRect().top));
    assert.ok(top >= 0 && top <= 140, `FAQ heading should sit just below the header after navigating (top = ${top}px)`);
    await context.close();
  });
});

describe('photo upload', () => {
  test('a large phone photo is resized in the browser before it is sent; a small one is sent untouched', async () => {
    const { default: sharp } = await import('sharp');
    const big = await sharp({ create: { width: 1600, height: 1200, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).png().toBuffer();
    const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#d32f2f' } }).png().toBuffer();
    assert.ok(big.length > 1500000, `test image should start large (${big.length} bytes)`);

    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const posts = [];
    await page.route('**/api/contact', async (route) => {
      const buf = route.request().postDataBuffer();
      posts.push({ size: buf.length, head: buf.toString('latin1') .slice(0, 4000) });
      await route.fulfill(okJson());
    });
    for (const [name, buffer] of [['big', big], ['small', small]]) {
      await page.goto(`${origin}/contact/`);
      await fillForm(page);
      await page.setInputFiles('#photo', { name: `${name}.png`, mimeType: 'image/png', buffer });
      await page.click('#submit-btn');
      await page.waitForURL(/contact\/thanks/);
    }
    assert.match(posts[0].head, /filename="photo\.jpg"/, 'big photo is re-encoded as a JPEG');
    assert.match(posts[0].head, /Content-Type: image\/jpeg/);
    assert.ok(posts[0].size < big.length * 0.6, `uploaded ${posts[0].size} bytes from a ${big.length}-byte photo`);
    assert.match(posts[1].head, /filename="small\.png"/, 'small photo is left alone');
    assert.ok(posts[1].size < small.length + 4000);
    await context.close();
  });

  test('a photo that cannot be decoded is still sent as-is (the server decides)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const posts = [];
    await page.route('**/api/contact', async (route) => { posts.push(route.request().postDataBuffer().toString('latin1').slice(0, 3000)); await route.fulfill(okJson()); });
    await page.goto(`${origin}/contact/`);
    await fillForm(page);
    const junk = Buffer.alloc(1700000, 7); // large, labelled PNG, but not an image
    await page.setInputFiles('#photo', { name: 'broken.png', mimeType: 'image/png', buffer: junk });
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.match(posts[0], /filename="broken\.png"/);
    await context.close();
  });
});
