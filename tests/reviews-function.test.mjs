// /api/reviews: official Business Profile API, server-side credentials, short cache, graceful failure.
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { __resetForTests, onRequestGet } from '../functions/api/reviews.ts';

const ENV = { GBP_CLIENT_ID: 'cid', GBP_CLIENT_SECRET: 'super-secret', GBP_REFRESH_TOKEN: 'refresh-secret', GBP_ACCOUNT_ID: '111', GBP_LOCATION_ID: '222' };
const realFetch = globalThis.fetch;

function review(overrides = {}) {
  return { reviewId: 'r1', reviewer: { displayName: 'Pat Q.', isAnonymous: false }, starRating: 'FIVE', comment: 'Fast and honest.', createTime: '2026-10-01T12:00:00Z', ...overrides };
}

function googleStub({ reviews = [review()], average = 5, total = 32, reviewsStatus = 200, tokenStatus = 200, calls = [] } = {}) {
  return async (url, init) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return tokenStatus === 200
        ? new Response(JSON.stringify({ access_token: 'access-123', expires_in: 3599 }), { status: 200 })
        : new Response('{"error":"invalid_grant"}', { status: tokenStatus });
    }
    if (u.startsWith('https://mybusiness.googleapis.com/')) {
      return reviewsStatus === 200
        ? new Response(JSON.stringify({ reviews, averageRating: average, totalReviewCount: total }), { status: 200 })
        : new Response('{"error":"nope"}', { status: reviewsStatus });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
}

function installCache() {
  const store = new Map();
  globalThis.caches = {
    default: {
      async match(req) { return store.get(req.url)?.clone(); },
      async put(req, res) { store.set(req.url, res); },
    },
  };
  return store;
}

async function get(env = ENV) {
  const res = await onRequestGet({ env });
  return { res, body: await res.json() };
}

beforeEach(() => __resetForTests());
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.caches;
});

test('without credentials it reports "not configured" and never calls Google', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  const { res, body } = await get({});
  assert.equal(res.status, 200);
  assert.deepEqual(body, { status: 'unavailable', reason: 'not_configured' });
  assert.equal(called, false);
  for (const missing of Object.keys(ENV)) {
    const partial = { ...ENV, [missing]: '' };
    assert.equal((await get(partial)).body.reason, 'not_configured', `missing ${missing}`);
  }
});

test('success: normalised reviews, Google\'s own aggregate, newest first, bearer token in a header', async () => {
  const calls = [];
  globalThis.fetch = googleStub({
    calls,
    average: 4.9,
    total: 33,
    reviews: [review({ reviewer: { displayName: 'Newest N.' }, comment: 'Newest', createTime: '2026-10-09T00:00:00Z' }), review({ reviewer: { displayName: 'Older O.' }, starRating: 'FOUR', comment: 'Older', createTime: '2026-09-01T00:00:00Z' })],
  });
  const { body } = await get();
  assert.equal(body.status, 'ok');
  assert.equal(body.source, 'google-business-profile');
  assert.equal(body.averageRating, 4.9);
  assert.equal(body.totalReviewCount, 33);
  assert.deepEqual(body.reviews.map((r) => [r.name, r.stars, r.text, r.date]), [['Newest N.', 5, 'Newest', '2026-10-09'], ['Older O.', 4, 'Older', '2026-09-01']]);
  const api = calls.find((c) => c.url.includes('mybusiness.googleapis.com'));
  assert.match(api.url, /\/v4\/accounts\/111\/locations\/222\/reviews\?/);
  assert.match(api.url, /orderBy=updateTime\+desc|orderBy=updateTime%20desc/);
  assert.equal(api.init.headers.Authorization, 'Bearer access-123');
  assert.ok(!api.url.includes('access-123'), 'token never goes in the URL');
});

test('ratings are never used to include or exclude a review (no cherry-picking)', async () => {
  globalThis.fetch = googleStub({ reviews: [review({ starRating: 'ONE', comment: 'Bad day', reviewer: { displayName: 'A' } }), review({ starRating: 'FIVE', comment: 'Great', reviewer: { displayName: 'B' } }), review({ starRating: 'THREE', comment: 'Fine', reviewer: { displayName: 'C' } })] });
  const { body } = await get();
  assert.deepEqual(body.reviews.map((r) => r.stars), [1, 5, 3]);
});

test('rating-only reviews (no words) are skipped as quotes, at most six are returned, anonymous reviewers are labelled', async () => {
  const many = Array.from({ length: 9 }, (_, i) => review({ comment: `Review ${i}`, reviewer: { displayName: `Person ${i}` } }));
  globalThis.fetch = googleStub({ reviews: [review({ comment: '' }), review({ comment: undefined }), review({ reviewer: { displayName: 'Secret', isAnonymous: true }, comment: 'Anon words' }), ...many] });
  const { body } = await get();
  assert.equal(body.reviews.length, 6);
  assert.equal(body.reviews[0].name, 'A Google user');
  assert.ok(body.reviews.every((r) => r.text));
});

test('review text is returned as plain data (no HTML interpretation) and control characters are stripped', async () => {
  globalThis.fetch = googleStub({ reviews: [review({ comment: '<img src=x onerror=alert(1)>\u0000Great\u0007 work' })] });
  const { body } = await get();
  assert.equal(body.reviews[0].text, '<img src=x onerror=alert(1)>Great work');
});

test('secrets never appear in the response, on success or failure', async () => {
  globalThis.fetch = googleStub();
  const ok = JSON.stringify((await get()).body);
  globalThis.fetch = googleStub({ tokenStatus: 400 });
  __resetForTests();
  const bad = JSON.stringify((await get()).body);
  for (const secret of ['super-secret', 'refresh-secret', 'access-123', 'cid']) {
    assert.ok(!ok.includes(secret) && !bad.includes(secret), `${secret} leaked`);
  }
});

test('every upstream failure degrades to a generic "unavailable" (HTTP 200); the precise cause is only in the operator log', async () => {
  const cases = [
    [{ tokenStatus: 400 }, 'auth'],
    [{ reviewsStatus: 401 }, 'auth'],
    [{ reviewsStatus: 403 }, 'forbidden'],
    [{ reviewsStatus: 429 }, 'quota'],
    [{ reviewsStatus: 500 }, 'upstream'],
  ];
  const original = console.error;
  for (const [opts, reason] of cases) {
    __resetForTests();
    const logged = [];
    console.error = (...a) => logged.push(a.join(' '));
    globalThis.fetch = googleStub(opts);
    try {
      const { res, body } = await get();
      assert.equal(res.status, 200, reason);
      assert.deepEqual(body, { status: 'unavailable', reason: 'upstream' }, 'visitors never see whether it was auth, quota or permissions');
    } finally {
      console.error = original;
    }
    assert.ok(logged.some((l) => l.includes(reason)), `operator log names the cause (${reason})`);
  }
  __resetForTests();
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  console.error = () => {};
  try { assert.deepEqual((await get()).body, { status: 'unavailable', reason: 'upstream' }); } finally { console.error = original; }
});

test('after a failed refresh Google is not called again on every page view (5-minute backoff)', async () => {
  installCache();
  const calls = [];
  globalThis.fetch = googleStub({ reviewsStatus: 500, calls });
  const original = console.error; console.error = () => {};
  try {
    await get();
    const afterFirst = calls.filter((c) => c.url.includes('mybusiness')).length;
    assert.equal(afterFirst, 1);
    for (let i = 0; i < 5; i++) await get();
    assert.equal(calls.filter((c) => c.url.includes('mybusiness')).length, 1, 'five more page views made no further upstream calls');
  } finally { console.error = original; }
});

test('simultaneous visitors share a single upstream refresh', async () => {
  const calls = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const inner = googleStub({ calls });
  globalThis.fetch = async (url, init) => { if (String(url).includes('mybusiness')) await gate; return inner(url, init); };
  const pending = Promise.all([get(), get(), get(), get()]);
  await new Promise((r) => setTimeout(r, 20));
  release();
  const results = await pending;
  assert.equal(calls.filter((c) => c.url.includes('mybusiness')).length, 1);
  assert.ok(results.every((r) => r.body.status === 'ok'));
});

test('a fresh cache avoids calling Google again; a failure after expiry serves stale for up to 24 hours', async () => {
  const store = installCache();
  const calls = [];
  globalThis.fetch = googleStub({ calls });
  await get();
  const upstreamCalls = () => calls.filter((c) => c.url.includes('mybusiness')).length;
  assert.equal(upstreamCalls(), 1);
  await get();
  assert.equal(upstreamCalls(), 1, 'second request served from cache');

  // age the cached entry to 8 hours and break Google
  const key = [...store.keys()][0];
  const aged = JSON.parse(await store.get(key).clone().text());
  aged.fetchedAt = new Date(Date.now() - 8 * 3600e3).toISOString();
  store.set(key, new Response(JSON.stringify(aged)));
  globalThis.fetch = googleStub({ reviewsStatus: 500 });
  const stale = await get();
  assert.equal(stale.body.status, 'ok', 'stale reviews beat an empty section');

  // older than 24 hours -> no longer served
  aged.fetchedAt = new Date(Date.now() - 30 * 3600e3).toISOString();
  store.set(key, new Response(JSON.stringify(aged)));
  const expired = await get();
  assert.deepEqual(expired.body, { status: 'unavailable', reason: 'upstream' });
});

test('the access token is reused until shortly before it expires', async () => {
  const calls = [];
  globalThis.fetch = googleStub({ calls });
  await get();
  await get(); // no cache installed -> second Google call, but no second token call
  const tokenCalls = calls.filter((c) => c.url.includes('oauth2')).length;
  assert.equal(tokenCalls, 1);
});
