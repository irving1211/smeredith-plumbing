// The redesigned request form: service-specific answers, timing, street address, "the problem you picked can stand in
// for a written description", and recognising a repeated post. These pin the server rules the new page relies on.
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';

const ENV = { CONTACT_MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key' };
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174111';

afterEach(() => {
  delete globalThis.caches;
});

function form(extra = {}, { withMessage = true } = {}) {
  const fd = new FormData();
  fd.set('name', 'Pat Example');
  fd.set('phone', '617-555-0142');
  fd.set('address', 'Lynn');
  if (withMessage) fd.set('message', 'Water heater is leaking at the base.');
  for (const [key, value] of Object.entries(extra)) fd.set(key, value);
  return fd;
}

async function submit(formData, { fetchImpl, json = true } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl || (async (url, init) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 200 }); });
  try {
    const request = new Request('https://smeredithplumbing.com/api/contact', { method: 'POST', body: formData, headers: json ? { accept: 'application/json' } : {} });
    const response = await onRequestPost({ request, env: ENV });
    let body = null;
    try { body = await response.clone().json(); } catch { /* redirect responses have no body */ }
    return { response, body, sent };
  } finally {
    globalThis.fetch = original;
  }
}

function installFakeCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) { return store.get(req.url)?.clone(); },
      async put(req, res) { store.set(req.url, res); },
    },
  };
}

// ---------- answers ----------

test('answers to the service questions reach Shane as readable labels', async () => {
  const { sent, body } = await submit(form({ service_type: 'water-heater-replacement', q_wh_fuel: 'gas', q_wh_issue: 'leaking', timing: 'soon' }));
  assert.equal(body.ok, true);
  const text = sent[0].text;
  assert.match(text, /What does it run on\?: Gas/);
  assert.match(text, /What is going on\?: Leaking/);
  assert.match(text, /How soon: In a few days/);
  assert.doesNotMatch(text, /q_wh/);
});

test("unknown option ids, other services' questions and prototype-ish keys are dropped, never echoed", async () => {
  const { sent, body } = await submit(
    form({ service_type: 'boiler-service', q_wh_fuel: 'gas', q_bl_type: '<script>alert(1)</script>', q_bl_issue: 'no-heat', q_constructor: 'x', q___proto__: 'y', timing: '<b>soon</b>' }),
  );
  assert.equal(body.ok, true);
  const text = sent[0].text;
  assert.match(text, /What do you need\?: No heat/);
  assert.doesNotMatch(text, /What does it run on|What kind of system|script|constructor|proto/);
  assert.match(text, /How soon: Not answered/);
});

test("a question answered for a service the visitor did not choose does not count", async () => {
  const { response, body } = await submit(form({ service_type: 'boiler-service', q_wh_issue: 'leaking' }, { withMessage: false }));
  assert.equal(response.status, 400);
  assert.equal(body.error, 'validation');
});

// ---------- the problem you picked can stand in for a description ----------

test('picking what the problem is can replace the written description', async () => {
  const { response, body, sent } = await submit(form({ service_type: 'water-heater-replacement', q_wh_issue: 'no-hot-water' }, { withMessage: false }));
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(sent[0].text, /Message:\n\s+Not written \(the customer answered the questions above\)/);
});

test('a real choice on an issue question for each service can stand in for the description', async () => {
  for (const extra of [
    { service_type: 'emergency-plumbing', q_em_issue: 'no-heat' },
    { service_type: 'boiler-service', q_bl_issue: 'yearly-service' },
    { service_type: 'kitchen-bath-remodels', q_rm_room: 'bathroom' },
    { service_type: 'new-construction-plumbing', q_nc_type: 'addition' },
    { service_type: 'general-plumbing', q_gp_issue: 'clog-or-slow-drain' },
  ]) {
    const { response } = await submit(form(extra, { withMessage: false }));
    assert.equal(response.status, 200, JSON.stringify(extra));
  }
  // gas has only a "what is it for" question, which is not an issue question
  const gas = await submit(form({ service_type: 'gas-installation', q_gas_use: 'dryer' }, { withMessage: false }));
  assert.equal(gas.response.status, 400);
});

test('"something else", "not sure", an answer to a non-issue question, or nothing at all still needs a written description', async () => {
  for (const extra of [
    { service_type: 'water-heater-replacement', q_wh_issue: 'other' },
    { service_type: 'water-heater-replacement', q_wh_fuel: 'gas' },
    { service_type: 'new-construction-plumbing', q_nc_type: 'unknown' },
    { service_type: 'other' },
    { service_type: 'not-sure' },
    {},
  ]) {
    const { response, body } = await submit(form(extra, { withMessage: false }));
    assert.equal(response.status, 400, JSON.stringify(extra));
    assert.equal(body.error, 'validation');
  }
});

test('name, phone and town stay required even when the problem was chosen', async () => {
  for (const missing of ['name', 'phone', 'address']) {
    const fd = form({ service_type: 'boiler-service', q_bl_issue: 'no-heat' }, { withMessage: false });
    fd.delete(missing);
    const { response } = await submit(fd);
    assert.equal(response.status, 400, `${missing} is still required`);
  }
});

// ---------- street address ----------

test('an optional street address joins the town on one line, and cannot add lines to the email', async () => {
  const { sent } = await submit(form({ street: '12 Main St\r\nBcc: attacker@example.com' }));
  const text = sent[0].text;
  assert.match(text, /Town \/ address: 12 Main St Bcc: attacker@example\.com, Lynn/);
  assert.match(text, /Service area check: Lynn - on Shane's confirmed list/);
  assert.equal(text.split('\n').some((line) => line.startsWith('Bcc:')), false);
});

// ---------- a repeated post ----------

test('the same request id twice sends one email and gives both callers the same confirmation', async () => {
  installFakeCache();
  const first = await submit(form({ request_id: REQUEST_ID }));
  const second = await submit(form({ request_id: REQUEST_ID }));
  assert.equal(first.sent.length, 1);
  assert.equal(second.sent.length, 0, 'no second email');
  assert.equal(second.body.ok, true);
  assert.equal(second.body.leadId, first.body.leadId, 'the confirmation carries the original lead id, so it is counted once');
});

test('the same id with DIFFERENT details is never swallowed: it is sent as an update that keeps the lead id (independent review finding 1)', async () => {
  installFakeCache();
  const first = await submit(form({ request_id: REQUEST_ID, name: 'Pat Example', phone: '617-555-0142' }));
  // e.g. the reply was lost, the visitor corrected a digit and sent again; or someone reused another visitor's id
  const fixed = await submit(form({ request_id: REQUEST_ID, name: 'Pat Example', phone: '617-555-0143' }));
  assert.equal(fixed.sent.length, 1, 'the corrected request reaches Shane');
  assert.equal(fixed.body.leadId, first.body.leadId, 'same lead id, so it is still counted once');
  assert.match(fixed.sent[0].subject, /Updated service request/);
  assert.match(fixed.sent[0].text, /This is an update: The same form was sent again with different details/);
  assert.match(fixed.sent[0].text, /617-555-0143/);
  // sending that corrected version again is a plain repeat
  const again = await submit(form({ request_id: REQUEST_ID, name: 'Pat Example', phone: '617-555-0143' }));
  assert.equal(again.sent.length, 0);
  assert.equal(again.body.leadId, first.body.leadId);
});

test('someone else reusing a remembered request id cannot suppress or read anything: their own request is delivered', async () => {
  installFakeCache();
  const victim = await submit(form({ request_id: REQUEST_ID, name: 'Victim', service_type: 'boiler-service' }));
  const other = await submit(form({ request_id: REQUEST_ID.toUpperCase(), name: 'Other Person', service_type: 'gas-installation', message: 'Different request' }));
  assert.equal(other.sent.length, 1, 'delivered, not silently dropped');
  assert.match(other.sent[0].text, /Name: Other Person/);
  assert.equal(victim.sent.length, 1);
});

test('adding a photo to an otherwise identical resend counts as a change, so the photo is not lost', async () => {
  installFakeCache();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]);
  const first = await submit(form({ request_id: REQUEST_ID }));
  const fd = form({ request_id: REQUEST_ID });
  fd.set('photo', new File([png], 'leak.png', { type: 'image/png' }));
  const withPhoto = await submit(fd);
  assert.equal(first.sent.length, 1);
  assert.equal(withPhoto.sent.length, 1);
  assert.ok(withPhoto.sent[0].attachments?.length || withPhoto.sent[0].attachment || JSON.stringify(withPhoto.sent[0]).includes('photo-'), 'the photo travels');
});

test('a failed delivery is not remembered, so the retry with the same id is sent', async () => {
  installFakeCache();
  const failed = await submit(form({ request_id: REQUEST_ID }), { fetchImpl: async () => new Response('no', { status: 500 }) });
  assert.equal(failed.response.status, 502);
  const retry = await submit(form({ request_id: REQUEST_ID }));
  assert.equal(retry.sent.length, 1);
  assert.equal(retry.body.ok, true);
});

test('a malformed request id is ignored (no deduplication, no error)', async () => {
  installFakeCache();
  const a = await submit(form({ request_id: 'not-a-uuid' }));
  const b = await submit(form({ request_id: 'not-a-uuid' }));
  assert.equal(a.sent.length + b.sent.length, 2);
});

test('an invalid post is never remembered: fixing it and resending the same id works', async () => {
  installFakeCache();
  const bad = await submit(form({ request_id: REQUEST_ID, phone: '12' }));
  assert.equal(bad.response.status, 400);
  const good = await submit(form({ request_id: REQUEST_ID }));
  assert.equal(good.sent.length, 1);
});

// ---------- hidden characters, links and the service-area hint (independent review findings 3, 4, 5) ----------

test('the service-area hint looks at the town only: a street named after another town does not change it', async () => {
  const medford = await submit(form({ address: 'Medford', street: '12 Lynn St' }));
  assert.match(medford.sent[0].text, /Service area check: Not on the confirmed list/);
  const boston = await submit(form({ address: 'Danvers', street: '5 Boston St' }));
  assert.match(boston.sent[0].text, /Service area check: Not on the confirmed list/);
  const real = await submit(form({ address: 'Lynn', street: '5 Boston St' }));
  assert.match(real.sent[0].text, /Service area check: Lynn - on Shane's confirmed list/);
});

test('hidden control and direction-override characters never reach the subject, name or email lines', async () => {
  const name = 'Pat\u0085Example\u202Edcba\u2066x\u2069';
  const { sent } = await submit(form({ name }));
  assert.doesNotMatch(sent[0].subject, /[\u0085\u202A-\u202E\u2066-\u2069]/);
  assert.match(sent[0].text, /Name: Pat Example dcba x/);
  assert.doesNotMatch(sent[0].text, /[\u0085\u2028\u2029\u202A-\u202E\u2066-\u2069]/);
});

test('every kind of line break inside the message stays inside its indented block, so it cannot forge email lines', async () => {
  const message = 'first line\rLead ID: FAKE-1\u0085Phone: FAKE-2\u2028Email: fake@example.com\r\nlast line';
  const { sent } = await submit(form({ message }));
  const lines = sent[0].text.split('\n');
  for (const forged of ['Lead ID: FAKE-1', 'Phone: FAKE-2', 'Email: fake@example.com']) {
    assert.equal(lines.some((l) => l === forged || l.startsWith(`${forged.split(':')[0]}: FAKE`)), false, `${forged} must not start a line`);
    assert.ok(lines.some((l) => l === `  ${forged}`), `${forged} is inside the indented message`);
  }
  assert.ok(lines.includes('  last line'));
  assert.match(sent[0].text, /Lead ID: [0-9a-f-]{36}/, 'the real lead id is still there');
});

test('links in any free-text field count toward the limit, so a chosen-problem request cannot carry spam links', async () => {
  const fd = form({ service_type: 'boiler-service', q_bl_issue: 'no-heat', name: 'http://a.example http://b.example http://c.example' }, { withMessage: false });
  const bad = await submit(fd);
  assert.equal(bad.response.status, 400);
  const fd2 = form({ service_type: 'boiler-service', q_bl_issue: 'no-heat', street: 'www.a.example www.b.example www.c.example' }, { withMessage: false });
  assert.equal((await submit(fd2)).response.status, 400);
  const fine = form({ service_type: 'boiler-service', q_bl_issue: 'no-heat', message: 'Photos at https://example.com/a and https://example.com/b' });
  assert.equal((await submit(fine)).response.status, 200, 'two links in the message are still allowed');
});
