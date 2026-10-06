import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost } from '../functions/api/contact.ts';

test('sends website leads from the Shane mailbox when no sender override is configured', async () => {
  const originalFetch = globalThis.fetch;
  let outboundPayload;

  globalThis.fetch = async (_url, init) => {
    outboundPayload = JSON.parse(init.body);
    return new Response(null, { status: 200 });
  };

  try {
    const formData = new FormData();
    formData.set('name', 'Test Customer');
    formData.set('phone', '555-0100');
    formData.set('address', 'Test Town');
    formData.set('message', 'Test service request');

    const request = new Request('https://smeredithplumbing.com/api/contact', {
      method: 'POST',
      body: formData,
    });

    const response = await onRequestPost({
      request,
      env: {
        CONTACT_MAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'test-key',
      },
    });

    assert.equal(response.status, 303);
    assert.equal(outboundPayload.from, 'shane@smeredithplumbing.com');
    assert.deepEqual(outboundPayload.to, ['shane@smeredithplumbing.com']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
