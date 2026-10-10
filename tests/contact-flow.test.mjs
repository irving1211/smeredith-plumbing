// End-to-end behaviour of POST /api/contact: stable service ids, honest attribution,
// success vs failed delivery, duplicate-conversion prevention, spam and upload protection.
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';
import { GBP_UTM } from '../src/lib/attribution.js';

const ENV = { CONTACT_MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  delete globalThis.caches;
});

function form(extra = {}) {
  const fd = new FormData();
  fd.set('name', 'Pat Example');
  fd.set('phone', '617-555-0142');
  fd.set('address', 'Lynn');
  fd.set('message', 'Water heater is leaking at the base.');
  for (const [key, value] of Object.entries(extra)) fd.set(key, value);
  return fd;
}

async function submit(formData, { env = ENV, headers = {}, json = false, fetchImpl } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch =
    fetchImpl ||
    (async (url, init) => {
      sent.push({ url: String(url), body: JSON.parse(init.body) });
      return new Response(null, { status: 200 });
    });
  try {
    const request = new Request('https://smeredithplumbing.com/api/contact', {
      method: 'POST',
      body: formData,
      headers: { ...(json ? { accept: 'application/json' } : {}), ...headers },
    });
    const response = await onRequestPost({ request, env });
    return { response, sent };
  } finally {
    globalThis.fetch = original;
  }
}

function installFakeCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) {
        return store.get(req.url)?.clone();
      },
      async put(req, res) {
        store.set(req.url, res);
      },
    },
  };
}

// ---------- service identifiers ----------

test('the chosen service travels as a stable id into the email and the confirmation URL', async () => {
  const { response, sent } = await submit(form({ service_type: 'boiler-service' }));
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.subject, /Boiler service, repair or replacement/);
  assert.match(sent[0].body.text, /Service requested: Boiler service, repair or replacement \(boiler-service\)/);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.searchParams.get('svc'), 'boiler-service');
});

test('every service id on the form is accepted; unknown ids are rejected, not echoed', async () => {
  const ids = ['emergency-plumbing', 'water-heater-replacement', 'boiler-service', 'kitchen-bath-remodels', 'new-construction-plumbing', 'gas-installation', 'general-plumbing', 'other'];
  for (const id of ids) {
    const { response } = await submit(form({ service_type: id }));
    assert.equal(new URL(response.headers.get('location')).searchParams.get('svc'), id, id);
  }
  const bad = await submit(form({ service_type: 'free-house<script>' }));
  assert.equal(bad.sent.length, 0);
  assert.equal(bad.response.headers.get('location'), 'https://smeredithplumbing.com/contact/?status=validation');
});

test('an empty service defaults to general plumbing and legacy option text from cached pages still maps', async () => {
  const empty = await submit(form());
  assert.equal(new URL(empty.response.headers.get('location')).searchParams.get('svc'), 'general-plumbing');
  const legacy = await submit(form({ service_type: 'Water heater' }));
  assert.equal(new URL(legacy.response.headers.get('location')).searchParams.get('svc'), 'water-heater-replacement');
});

// ---------- attribution ----------

test('email reports what the customer said and what was captured, separately', async () => {
  const { sent } = await submit(
    form({
      heard_about: 'google-maps',
      utm_source: GBP_UTM.source,
      utm_medium: GBP_UTM.medium,
      utm_campaign: GBP_UTM.campaign,
      landing_page: '/services/boiler-service/',
      referrer: 'https://www.google.com/',
    }),
  );
  const text = sent[0].body.text;
  assert.match(text, /Customer said they heard about us: Google Maps/);
  assert.match(text, /Captured source: Google Business Profile \(tagged profile link\)/);
  assert.match(text, /First-touch tag \(source \/ medium \/ campaign\): google-business-profile \/ organic \/ gbp-website/);
  assert.match(text, /Landing page \(first visit\): \/services\/boiler-service\//);
  assert.match(text, /Referrer \(first visit\): https:\/\/www\.google\.com\//);
});

test('an untagged Google referral is never reported as organic search or Maps', async () => {
  const { sent } = await submit(form({ referrer: 'https://www.google.com/search?q=plumber+near+me' }));
  const text = sent[0].body.text;
  assert.match(text, /Captured source: Google referral, untagged/);
  assert.doesNotMatch(text, /organic/i);
  assert.doesNotMatch(text, /q=plumber/, 'search terms in the referrer query are dropped');
});

test('no tag and no referrer is reported as direct or unknown', async () => {
  const { sent } = await submit(form());
  assert.match(sent[0].body.text, /Captured source: Direct or unknown/);
  assert.match(sent[0].body.text, /Customer said they heard about us: Not answered/);
});

test('a later campaign tag is kept separately and only shown when it differs from first touch', async () => {
  const differs = await submit(form({ utm_source: 'google-business-profile', utm_medium: 'organic', latest_utm_source: 'facebook', latest_utm_medium: 'social', latest_utm_campaign: 'bio' }));
  assert.match(differs.sent[0].body.text, /Later campaign tag in the same visit: facebook \/ social \/ bio/);
  assert.match(differs.sent[0].body.text, /First-touch tag .*: google-business-profile \/ organic/);
  const same = await submit(form({ utm_source: 'facebook', utm_medium: 'social', latest_utm_source: 'facebook', latest_utm_medium: 'social' }));
  assert.doesNotMatch(same.sent[0].body.text, /Later campaign tag/);
});

test('landing page must be a site path; off-site or protocol-relative values are dropped', async () => {
  const { sent } = await submit(form({ landing_page: '//evil.example/x?y=1' }));
  assert.doesNotMatch(sent[0].body.text, /Landing page/);
  const ok = await submit(form({ landing_page: '/areas/lynn/?secret=1' }));
  assert.match(ok.sent[0].body.text, /Landing page \(first visit\): \/areas\/lynn\/$/m);
});

test('the email tells Shane whether the town is on the confirmed list', async () => {
  const inArea = await submit(form({ address: '12 Main St, Lynn, MA' }));
  assert.match(inArea.sent[0].body.text, /Service area check: Lynn - on Shane's confirmed list/);
  const outside = await submit(form({ address: '77 Elm St, Andover, MA' }));
  assert.match(outside.sent[0].body.text, /Service area check: Not on the confirmed list - confirm availability before quoting/);
  const ambiguous = await submit(form({ address: '45 Malden St Revere' }));
  assert.match(ambiguous.sent[0].body.text, /Mentions Revere, Malden - verify the actual town/);
});

// ---------- success, failure, and duplicate conversion ----------

test('a successful submission returns a one-time lead id; two submissions never share one', async () => {
  const a = await submit(form(), { json: true });
  const b = await submit(form(), { json: true });
  const bodyA = await a.response.json();
  const bodyB = await b.response.json();
  assert.equal(a.response.status, 200);
  assert.equal(bodyA.ok, true);
  assert.match(bodyA.leadId, UUID);
  assert.notEqual(bodyA.leadId, bodyB.leadId);
  assert.equal(new URL(bodyA.redirect).searchParams.get('lead'), bodyA.leadId);
  assert.match(a.sent[0].body.text, new RegExp(`Lead ID: ${bodyA.leadId}`));
});

test('a failed delivery is reported as a failure with no lead id, so no conversion can be counted', async () => {
  const failing = async () => new Response('boom', { status: 500 });
  const browser = await submit(form(), { fetchImpl: failing });
  assert.equal(browser.response.status, 303);
  const location = browser.response.headers.get('location');
  assert.equal(location, 'https://smeredithplumbing.com/contact/?status=delivery');
  assert.doesNotMatch(location, /lead=/);

  const api = await submit(form(), { json: true, fetchImpl: failing });
  assert.equal(api.response.status, 502);
  assert.deepEqual(await api.response.json(), { ok: false, error: 'delivery' });
});

test('delivery failure is never logged with visitor details', async () => {
  const original = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    await submit(form({ name: 'Zelda Private', phone: '617-555-0199' }), { fetchImpl: async () => new Response('x', { status: 500 }) });
  } finally {
    console.error = original;
  }
  assert.ok(logged.length > 0, 'failure is logged for the operator');
  assert.doesNotMatch(logged.join('\n'), /Zelda|617-555-0199|Water heater is leaking/);
});

test('the confirmation URL contains only enumerated ids and a random lead id — no personal data', async () => {
  const { response } = await submit(
    form({ name: 'Zelda Private', phone: '617-555-0199', email: 'zelda@example.com', address: '9 Secret Ln, Lynn', message: 'Private message text', service_type: 'water-heater-replacement', heard_about: 'referral' }),
  );
  const location = response.headers.get('location');
  for (const secret of ['Zelda', 'Private', '617', '0199', 'zelda@', 'Secret', 'Lynn', 'message']) {
    assert.ok(!location.includes(secret), `confirmation URL leaks ${secret}`);
  }
  const url = new URL(location);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['ha', 'lead', 'src', 'svc']);
  assert.equal(url.pathname, '/contact/thanks/');
});

test('the honeypot returns a believable success but sends nothing and issues no lead id', async () => {
  const browser = await submit(form({ _honey: 'bot' }));
  assert.equal(browser.sent.length, 0);
  assert.equal(browser.response.headers.get('location'), 'https://smeredithplumbing.com/contact/thanks/');
  const api = await submit(form({ _honey: 'bot' }), { json: true });
  const body = await api.response.json();
  assert.equal(body.ok, true);
  assert.equal(body.leadId, undefined);
  assert.doesNotMatch(body.redirect, /lead=/);
});

test('validation errors ask the visitor to fix the form and send nothing', async () => {
  for (const bad of [{ name: '' }, { phone: '12' }, { address: '' }, { message: '' }, { email: 'not-an-email' }]) {
    const { response, sent } = await submit(form(bad), { json: true });
    assert.equal(response.status, 400, JSON.stringify(bad));
    assert.deepEqual(await response.json(), { ok: false, error: 'validation' });
    assert.equal(sent.length, 0);
  }
});

// ---------- spam / abuse ----------

test('cross-site posts are blocked before anything is parsed or sent', async () => {
  const { response, sent } = await submit(form(), { headers: { origin: 'https://evil.example' }, json: true });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { ok: false, error: 'blocked' });
  assert.equal(sent.length, 0);
  const own = await submit(form(), { headers: { origin: 'https://smeredithplumbing.com' } });
  assert.equal(own.sent.length, 1);
});

test('per-IP rate limit stops a flood after five requests and fails open without a cache', async () => {
  installFakeCache();
  const headers = { 'cf-connecting-ip': '203.0.113.9' };
  for (let i = 0; i < 5; i++) {
    const { sent } = await submit(form(), { headers });
    assert.equal(sent.length, 1, `request ${i + 1} should go through`);
  }
  const sixth = await submit(form(), { headers, json: true });
  assert.equal(sixth.response.status, 429);
  assert.deepEqual(await sixth.response.json(), { ok: false, error: 'rate' });
  assert.equal(sixth.sent.length, 0);
  const other = await submit(form(), { headers: { 'cf-connecting-ip': '198.51.100.7' } });
  assert.equal(other.sent.length, 1, 'a different visitor is unaffected');

  delete globalThis.caches;
  const noCache = await submit(form(), { headers });
  assert.equal(noCache.sent.length, 1, 'no cache available -> fail open');
});

test('link-stuffed messages are rejected honestly; one or two links are fine', async () => {
  const spam = await submit(form({ message: 'see http://a.example http://b.example www.c.example' }), { json: true });
  assert.equal(spam.response.status, 400);
  assert.equal(spam.sent.length, 0);
  const fine = await submit(form({ message: 'Here is the manual: https://example.com/heater.pdf' }));
  assert.equal(fine.sent.length, 1);
});

test('Turnstile is enforced only when a secret is configured, and a bad token is refused', async () => {
  const withSecret = { ...ENV, TURNSTILE_SECRET_KEY: 'secret' };
  const fetchImpl = (sent) => async (url, init) => {
    if (String(url).includes('siteverify')) {
      return new Response(JSON.stringify({ success: init.body.get('response') === 'good-token' }), { status: 200 });
    }
    sent.push(JSON.parse(init.body));
    return new Response(null, { status: 200 });
  };

  const none = [];
  const missing = await submit(form(), { env: withSecret, json: true, fetchImpl: fetchImpl(none) });
  assert.equal(missing.response.status, 403);
  assert.deepEqual(await missing.response.json(), { ok: false, error: 'verification' });
  assert.equal(none.length, 0);

  const bad = [];
  const rejected = await submit(form({ 'cf-turnstile-response': 'bad' }), { env: withSecret, json: true, fetchImpl: fetchImpl(bad) });
  assert.equal(rejected.response.status, 403);
  assert.equal(bad.length, 0);

  const good = [];
  const accepted = await submit(form({ 'cf-turnstile-response': 'good-token' }), { env: withSecret, json: true, fetchImpl: fetchImpl(good) });
  assert.equal(accepted.response.status, 200);
  assert.equal(good.length, 1);

  const open = await submit(form());
  assert.equal(open.sent.length, 1, 'without a secret the form is unchanged');
});

// ---------- uploads ----------

function file(bytes, name, type) {
  return new File([Uint8Array.from(bytes)], name, { type });
}
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0];
const HEIC = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0];
const PDF = [...'%PDF-1.7\n%âãÏÓ'].map((c) => c.charCodeAt(0) & 0xff);

test('uploads are accepted by what the bytes are, and renamed so no personal file name is emailed', async () => {
  for (const [bytes, name, type, ext] of [
    [PNG, 'Pat Example kitchen.PNG', 'image/png', 'png'],
    [JPEG, 'IMG_0001.jpeg', 'image/jpeg', 'jpg'],
    [HEIC, 'IMG_0002.HEIC', '', 'heic'],
    [PDF, 'quote.pdf', 'application/pdf', 'pdf'],
  ]) {
    const { sent } = await submit(form({ photo: file(bytes, name, type) }));
    assert.equal(sent.length, 1, name);
    const attachment = sent[0].body.attachments[0];
    assert.match(attachment.filename, new RegExp(`^photo-[0-9a-f]{8}\\.${ext}$`), name);
    assert.ok(!attachment.filename.includes('Pat'), 'visitor file name must not be reused');
  }
});

test('a file that is not really an image/PDF is rejected even if the browser says it is', async () => {
  const exe = [0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0];
  const disguised = await submit(form({ photo: file(exe, 'cute-cat.jpg', 'image/jpeg') }), { json: true });
  assert.equal(disguised.response.status, 400);
  assert.equal(disguised.sent.length, 0);
  const html = await submit(form({ photo: file([...'<html><script>alert(1)</script>'].map((c) => c.charCodeAt(0)), 'x.png', 'image/png') }), { json: true });
  assert.equal(html.response.status, 400);
});

test('oversized uploads are rejected and nothing is emailed', async () => {
  const big = new File([new Uint8Array(10 * 1024 * 1024 + 1).fill(0)], 'big.png', { type: 'image/png' });
  const { response, sent } = await submit(form({ photo: big }), { json: true });
  assert.equal(response.status, 400);
  assert.equal(sent.length, 0);
});

test('an oversized declared request body is refused before it is read', async () => {
  const { response, sent } = await submit(form(), { headers: { 'content-length': String(13 * 1024 * 1024) }, json: true });
  assert.equal(response.status, 413);
  assert.equal(sent.length, 0);
});

// ---------- output safety ----------

test('visitor text is HTML-escaped in the email and cannot inject headers into the subject', async () => {
  const { sent } = await submit(form({ name: 'Bob\r\nBcc: x@y.z', message: '<script>alert(1)</script> & more' }));
  assert.doesNotMatch(sent[0].body.subject, /[\r\n]/);
  assert.match(sent[0].body.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; more/);
  assert.doesNotMatch(sent[0].body.html, /<script>alert/);
});
