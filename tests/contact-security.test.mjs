import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';

const ENV = { CONTACT_MAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key' };

function validForm(extra = {}) {
  const formData = new FormData();
  formData.set('name', 'Test Customer');
  formData.set('phone', '555-0100');
  formData.set('address', 'Test Town');
  formData.set('message', 'Test service request');
  for (const [key, value] of Object.entries(extra)) formData.set(key, value);
  return formData;
}

async function post(formData, captureFetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    captureFetch?.(JSON.parse(init.body));
    return new Response(null, { status: 200 });
  };
  try {
    return await onRequestPost({
      request: new Request('https://smeredithplumbing.com/api/contact', { method: 'POST', body: formData }),
      env: ENV,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('ignores off-site success/error redirect targets (no open redirect)', async () => {
  const honeypot = await post(validForm({ _honey: 'bot', success_url: 'https://evil.example/' }));
  assert.equal(honeypot.headers.get('location'), 'https://smeredithplumbing.com/contact/thanks/');

  const invalid = new FormData();
  invalid.set('error_url', '//evil.example/contact/');
  const error = await post(invalid);
  assert.equal(error.headers.get('location'), 'https://smeredithplumbing.com/contact/?status=validation');
});

test('keeps same-origin redirect targets', async () => {
  const response = await post(validForm({ success_url: 'https://smeredithplumbing.com/contact/thanks/' }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'https://smeredithplumbing.com/contact/thanks/');
});

test('includes lead source and attribution in the notification email', async () => {
  let payload;
  await post(
    validForm({
      heard_about: 'Google Maps',
      utm_source: 'google',
      utm_medium: 'organic',
      utm_campaign: '',
      landing_page: '/services/boiler-service/',
      referrer: 'https://www.google.com/',
    }),
    (body) => (payload = body),
  );
  assert.match(payload.text, /How they heard about us: Google Maps/);
  assert.match(payload.text, /UTM source: google/);
  assert.match(payload.text, /Landing page: \/services\/boiler-service\//);
  assert.match(payload.html, /Google Maps/);
  assert.doesNotMatch(payload.text, /UTM campaign/);
});
