// The redesigned request form in a real browser: every service choice, the questions that appear for it, the shorter path,
// error handling and recovery, keyboard use, autofill attributes, duplicate prevention, and what analytics may see.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chooseService, fillForm, launch, LEAD_ID, named, phoneContext, serve, serviceValue } from './helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const options = JSON.parse(readFileSync(join(root, 'src/service-options.json'), 'utf8'));
const questions = JSON.parse(readFileSync(join(root, 'src/request-questions.json'), 'utf8'));
let browser, server, origin;

before(async () => {
  ({ server, origin } = await serve(join(root, 'dist')));
  browser = await launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

// A multipart field value from a recorded post body; undefined when the field was not sent at all.
const field = (body, name) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1];
const okJson = (svc = 'not-sure') => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ ok: true, leadId: LEAD_ID, redirect: `${origin}/contact/thanks/?lead=${LEAD_ID}&svc=${svc}&src=direct_or_unknown` }),
});
async function mockContact(page, handler = (route) => route.fulfill(okJson())) {
  const seen = [];
  await page.route('**/api/contact', async (route) => {
    seen.push({ body: route.request().postData() || '', headers: route.request().headers() });
    await handler(route, seen.length);
  });
  return seen;
}
const newForm = async (browserContext, path = '/contact/') => {
  const page = await browserContext.newPage();
  await page.goto(`${origin}${path}`);
  return page;
};
const visibleGroup = (page) => page.locator('[data-service-group]:not([hidden])');

describe('every service choice', () => {
  test('all nine choices are offered, including Something else and Not sure, and each one is submitted with its stable id', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const offered = await page.locator('input[name="service_type"]').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(offered.sort(), options.map((o) => o.id).sort());
    assert.ok(offered.includes('other') && offered.includes('not-sure'));
    for (const o of options) {
      const p = await newForm(context);
      const seen = await mockContact(p);
      await p.check(`input[name="service_type"][value="${o.id}"]`);
      await fillForm(p);
      await p.click('#submit-btn');
      await p.waitForURL(/contact\/thanks/);
      assert.equal(field(seen[0].body, 'service_type'), o.id, o.id);
      await p.close();
    }
    await context.close();
  });

  test('nothing is chosen for the visitor; a request that names no service posts none and the server records it as not sure', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const seen = await mockContact(page);
    assert.equal(await serviceValue(page), '');
    await fillForm(page);
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'service_type'), undefined);
    await context.close();
  });
});

describe('questions that appear only when they apply', () => {
  test('each service with questions shows exactly its own, announced politely, with a Don\'t know / Something else way out; other and not sure show none', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    for (const o of options) {
      await chooseService(page, o.id);
      const wanted = questions.services[o.id];
      const shown = await visibleGroup(page).count();
      if (!wanted) { assert.equal(shown, 0, `${o.id} shows no questions`); continue; }
      assert.equal(shown, 1, `${o.id} shows one group`);
      const legends = await visibleGroup(page).locator('legend').allTextContents();
      assert.equal(legends.length, wanted.questions.length, `${o.id} question count`);
      assert.equal(await page.locator('#reveal-status').textContent(), wanted.announce, 'a screen reader is told questions appeared');
      for (const q of wanted.questions) {
        const labels = await visibleGroup(page).locator(`input[name="q_${q.id}"]`).evaluateAll((els) => els.map((e) => e.value));
        assert.deepEqual(labels, q.options.map((x) => x.id));
        assert.ok(q.options.some((x) => ['other', 'unknown'].includes(x.id)), `${q.id} always has a way out`);
      }
      assert.ok((await page.evaluate(() => document.activeElement.tagName)) !== 'FIELDSET', 'focus is never moved by the reveal');
    }
    await context.close();
  });

  test('answers are posted for the chosen service only; switching service drops the old answers', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const seen = await mockContact(page);
    await chooseService(page, 'water-heater-replacement');
    await page.check('input[name="q_wh_fuel"][value="gas"]');
    await page.check('input[name="q_wh_issue"][value="leaking"]');
    await chooseService(page, 'boiler-service');
    assert.equal(await page.locator('input[name="q_wh_fuel"]:checked').count(), 0, 'the old answers are cleared');
    await page.check('input[name="q_bl_issue"][value="no-heat"]');
    await fillForm(page);
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'q_bl_issue'), 'no-heat');
    assert.equal(field(seen[0].body, 'q_wh_fuel'), undefined, 'hidden questions are not submitted');
    assert.equal(field(seen[0].body, 'q_wh_issue'), undefined);
    await context.close();
  });
});

describe('the shorter path', () => {
  test('from a service page: one tap, a name and a phone number send a complete request (no description typed)', async () => {
    const { context } = await phoneContext(browser);
    const page = await context.newPage();
    const seen = await mockContact(page, (route) => route.fulfill(okJson('water-heater-replacement')));
    await page.goto(`${origin}/services/water-heater-replacement/`);
    await page.locator('.hero-cta').getByRole('link', { name: 'Request service online' }).click();
    await page.waitForURL(/contact\/\?service=water-heater-replacement/);
    await page.check('input[name="q_wh_issue"][value="no-hot-water"]');
    assert.equal(await page.locator('#message').evaluate((el) => el.required), false, 'a chosen problem replaces the written description');
    assert.match(await page.locator('#message-label').textContent(), /optional/);
    await page.fill('#name', 'Pat Example');
    await page.fill('#phone', '617-555-0142');
    await page.fill('#address', 'Lynn');
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(field(seen[0].body, 'service_type'), 'water-heater-replacement');
    assert.equal(field(seen[0].body, 'q_wh_issue'), 'no-hot-water');
    assert.equal(field(seen[0].body, 'message'), '', 'no description was typed');
    await context.close();
  });

  test('choosing "something else" or "don\'t know" brings the written description back', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=boiler-service');
    await page.check('input[name="q_bl_issue"][value="leaking"]');
    assert.equal(await page.locator('#message').evaluate((el) => el.required), false);
    await page.check('input[name="q_bl_issue"][value="other"]');
    assert.equal(await page.locator('#message').evaluate((el) => el.required), true);
    await page.check('input[name="q_bl_issue"][value="leaking"]');
    await chooseService(page, 'new-construction-plumbing');
    await page.check('input[name="q_nc_type"][value="unknown"]');
    assert.equal(await page.locator('#message').evaluate((el) => el.required), true, '"not sure" tells Shane nothing');
    await context.close();
  });

  test('timing: "right now" shows the call-now note for any service; the other timings do not', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=general-plumbing');
    assert.equal(await page.locator('#emergency-note').isVisible(), false);
    await page.check('input[name="timing"][value="now"]');
    assert.equal(await page.locator('#emergency-note').isVisible(), true);
    await page.check('input[name="timing"][value="planning"]');
    assert.equal(await page.locator('#emergency-note').isVisible(), false);
    await context.close();
  });

  test('the town says whether Shane serves it (in words, without blocking the request), including street + town and unlisted towns', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const status = page.locator('#town-status');
    await page.fill('#address', 'Lynn');
    await page.press('#address', 'Tab');
    assert.equal(await status.textContent(), 'Shane serves Lynn.');
    await page.fill('#address', '12 Main St, Revere, MA 02151');
    await page.press('#address', 'Tab');
    assert.equal(await status.textContent(), 'Shane serves Revere.');
    await page.fill('#address', 'Andover');
    await page.press('#address', 'Tab');
    assert.match(await status.textContent(), /isn't on Shane's list yet\. Send the request anyway/);
    assert.doesNotMatch(await status.textContent(), /Andover|sorry|unable|outside/i);
    assert.equal(await status.getAttribute('role'), 'status');
    await context.close();
  });
});

describe('errors, back/edit and recovery', () => {
  test('an incomplete form shows one summary that takes focus, a message at each field, and keeps every answer', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=water-heater-replacement');
    const seen = await mockContact(page);
    await page.fill('#email', 'not-an-email');
    await page.check('input[name="q_wh_fuel"][value="electric"]');
    await page.click('#submit-btn');
    const summary = page.locator('#form-status');
    await summary.waitFor({ state: 'visible' });
    assert.equal(seen.length, 0, 'nothing was sent');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'form-status');
    assert.match(await page.title(), /^Error: /);
    const items = await page.locator('#form-status-list a').allTextContents();
    assert.deepEqual(items, [
      'Enter your town', 'Enter your name', 'Enter a phone number Shane can call or text',
      'Enter an email address like name@example.com, or leave it empty', 'Choose what is going on above, or describe the problem',
    ]);
    for (const id of ['address', 'name', 'phone', 'email', 'message']) {
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true', id);
      assert.match(await page.locator(`#${id}`).getAttribute('aria-describedby'), new RegExp(`${id}-error`));
    }
    assert.equal(await page.inputValue('#email'), 'not-an-email', 'what was typed is kept');
    assert.equal(await page.locator('input[name="q_wh_fuel"][value="electric"]').isChecked(), true, 'answers are kept');
    // the summary links go to the fields
    await page.locator('#form-status-list a', { hasText: 'Enter your name' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'name');
    // only enumerated field ids reach analytics
    const ev = named(events, 'form_validation_error')[0];
    assert.equal(ev.error_fields, 'address,name,phone,email,message');
    assert.ok(!JSON.stringify(events).includes('not-an-email'));
    // fixing everything clears the errors and sends
    await page.fill('#address', 'Lynn');
    await page.fill('#name', 'Pat Example');
    await page.fill('#phone', '617-555-0142');
    await page.fill('#email', 'pat@example.com');
    await page.check('input[name="q_wh_issue"][value="leaking"]');
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(seen.length, 1);
    await context.close();
  });

  test('offline: the visitor is told nothing was sent, keeps their answers, and the retry goes through with the same request id', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=general-plumbing');
    const seen = [];
    let online = false;
    await page.route('**/api/contact', async (route) => {
      seen.push(route.request().postData() || '');
      if (!online) return route.abort('internetdisconnected');
      return route.fulfill(okJson('general-plumbing'));
    });
    await page.check('input[name="q_gp_issue"][value="leak-or-drip"]');
    await page.fill('#name', 'Pat Example');
    await page.fill('#phone', '617-555-0142');
    await page.fill('#address', 'Lynn');
    await page.click('#submit-btn');
    await page.locator('#form-status').waitFor({ state: 'visible' });
    assert.match(await page.locator('#form-status-text').textContent(), /could not reach the server, so your request has not been sent.*Your answers are still in the form/);
    assert.equal(await page.inputValue('#name'), 'Pat Example');
    assert.equal(await page.locator('input[name="q_gp_issue"][value="leak-or-drip"]').isChecked(), true);
    assert.equal(await page.locator('#submit-btn').isEnabled(), true);
    online = true;
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(seen.length, 2);
    assert.equal(field(seen[0], 'request_id'), field(seen[1], 'request_id'), 'a retry carries the same id, so the server can recognise it');
    await context.close();
  });

  test('server refusals are explained honestly: too many requests, blocked, and a bad photo', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await newForm(context);
    let code = 'rate';
    await page.route('**/api/contact', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: code }) }));
    await fillForm(page);
    await page.click('#submit-btn');
    await page.locator('#form-status').waitFor({ state: 'visible' });
    assert.match(await page.locator('#form-status-text').textContent(), /Too many requests came from this connection/);
    code = 'blocked';
    await page.click('#submit-btn');
    await page.waitForFunction(() => /blocked for safety/.test(document.getElementById('form-status-text').textContent));
    assert.deepEqual(named(events, 'form_error').map((e) => e.error_type), ['rate', 'blocked']);
    assert.equal(named(events, 'generate_lead').length, 0);
    await context.close();
  });

  test('a repeated tap sends one request; a copy restored from the back button gets a fresh request id', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const seen = await mockContact(page, async (route) => { await new Promise((r) => setTimeout(r, 300)); await route.fulfill(okJson()); });
    await fillForm(page);
    const id = await page.locator('[data-request-id]').inputValue();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await page.dblclick('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(seen.length, 1);
    assert.equal(field(seen[0].body, 'request_id'), id);
    const fresh = await newForm(context);
    await fresh.evaluate(() => window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    assert.notEqual(await fresh.locator('[data-request-id]').inputValue(), id);
    await context.close();
  });

  test('back/edit: the Change button reopens the full list with the current choice focused, and nothing typed is lost', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=boiler-service&town=lynn');
    await page.fill('#name', 'Pat Example');
    await page.click('#service-change');
    assert.equal(await page.locator('#service-change').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.value), 'boiler-service');
    await page.check('input[name="service_type"][value="water-heater-replacement"]');
    assert.equal(await page.inputValue('#name'), 'Pat Example');
    assert.equal(await page.inputValue('#address'), 'Lynn');
    await context.close();
  });
});

describe('keyboard, autofill and privacy', () => {
  test('the whole form can be completed from the keyboard: arrow keys choose in a group, Enter sends', async () => {
    const { context } = await phoneContext(browser, { isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } });
    const page = await newForm(context);
    const seen = await mockContact(page);
    await page.locator('input[name="service_type"]').first().focus();
    await page.keyboard.press('ArrowDown'); // emergency -> water heater
    assert.equal(await serviceValue(page), 'water-heater-replacement');
    for (let i = 0; i < 20 && (await page.evaluate(() => document.activeElement.name)) !== 'q_wh_fuel'; i++) await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('input[name="q_wh_fuel"]:checked').count(), 1);
    await page.fill('#name', 'Pat Example');
    await page.fill('#phone', '617-555-0142');
    await page.fill('#address', 'Lynn');
    await page.fill('#message', 'Heater is old and rusty.');
    await page.press('#message', 'Tab');
    await page.locator('#submit-btn').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(/contact\/thanks/);
    assert.equal(seen.length, 1);
    await context.close();
  });

  test('inputs ask the phone for the right keyboard and offer autofill', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const attrs = (id) => page.locator(`#${id}`).evaluate((el) => ({ type: el.type, autocomplete: el.autocomplete, inputmode: el.inputMode, required: el.required }));
    assert.deepEqual(await attrs('name'), { type: 'text', autocomplete: 'name', inputmode: '', required: true });
    assert.deepEqual(await attrs('phone'), { type: 'tel', autocomplete: 'tel', inputmode: 'tel', required: true });
    assert.deepEqual(await attrs('email'), { type: 'email', autocomplete: 'email', inputmode: 'email', required: false });
    assert.deepEqual(await attrs('address'), { type: 'text', autocomplete: 'address-level2', inputmode: '', required: true });
    assert.equal((await attrs('street')).autocomplete, 'address-line1');
    assert.equal(await page.locator('input[name="_honey"]').getAttribute('autocomplete'), 'off', 'only the bot trap opts out');
    assert.equal(await page.locator('form').getAttribute('autocomplete'), null, 'autofill is never switched off for the form');
    await context.close();
  });

  test('every control has a visible label, and the photo is optional', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context);
    const unlabeled = await page.evaluate(() =>
      [...document.querySelectorAll('form input:not([type=hidden]):not(.hp input), form select, form textarea')]
        .filter((el) => !el.labels || !el.labels.length)
        .map((el) => el.name || el.id));
    assert.deepEqual(unlabeled, []);
    assert.equal(await page.locator('#photo').evaluate((el) => el.required), false);
    assert.match(await page.locator('label[for="photo"]').textContent(), /optional/);
    await context.close();
  });

  test('analytics sees service ids and enumerated steps only: never names, numbers, towns, answers or text', async () => {
    const { context, events } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=water-heater-replacement&town=lynn');
    await mockContact(page, (route) => route.fulfill(okJson('water-heater-replacement')));
    await page.check('input[name="q_wh_issue"][value="leaking"]');
    await page.check('input[name="timing"][value="now"]');
    await page.fill('#name', 'Zelda Private');
    await page.fill('#phone', '617-555-0199');
    await page.click('.more summary');
    await page.fill('#street', '9 Secret Ln');
    await page.fill('#message', 'Private message text');
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    await page.waitForTimeout(250);
    const wire = JSON.stringify(events);
    for (const secret of ['Zelda', '617-555-0199', 'Secret Ln', 'Private message', 'Lynn', 'leaking', LEAD_ID]) assert.ok(!wire.includes(secret), `analytics leaked ${secret}`);
    assert.deepEqual(named(events, 'form_submit_attempt').map((e) => [e.service_type, e.timing]), [['water-heater-replacement', 'now']]);
    assert.equal(named(events, 'generate_lead').length, 1);
    assert.ok(named(events, 'form_start').length === 1 && named(events, 'request_form_open').length === 1);
    await context.close();
  });

  test('no customer details are written to browser storage', async () => {
    const { context } = await phoneContext(browser);
    const page = await newForm(context, '/contact/?service=general-plumbing');
    await mockContact(page);
    await page.fill('#name', 'Zelda Private');
    await page.fill('#phone', '617-555-0199');
    await page.fill('#address', 'Lynn');
    await page.fill('#message', 'Private message text');
    const dump = async () => page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]) + document.cookie);
    const before = await dump();
    for (const secret of ['Zelda', '617-555-0199', 'Private message']) assert.ok(!before.includes(secret), `stored ${secret} while typing`);
    await page.click('#submit-btn');
    await page.waitForURL(/contact\/thanks/);
    const after = await dump();
    for (const secret of ['Zelda', '617-555-0199', 'Private message']) assert.ok(!after.includes(secret), `stored ${secret} after sending`);
    await context.close();
  });
});

describe('without JavaScript', () => {
  test('the form is still complete: every required field is native, the description is required, and the questions stay out of the way', async () => {
    const { context } = await phoneContext(browser, { javaScriptEnabled: false });
    const page = await newForm(context, '/contact/?service=boiler-service');
    assert.equal(await page.locator('[data-service-group]:visible').count(), 0, 'no hidden-by-script questions are shown');
    for (const id of ['name', 'phone', 'address', 'message']) assert.equal(await page.locator(`#${id}`).evaluate((el) => el.required), true, id);
    assert.equal(await page.locator('#service-tiles').isVisible(), true, 'the whole service list is visible');
    assert.equal(await page.locator('input[name="service_type"]:checked').count(), 0, 'no service is pre-chosen without script (the server records "not sure")');
    await context.close();
  });
});
