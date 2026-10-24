// Google Analytics 4 configuration: on by default for this site, overridable per build, and restricted to production hostnames.
import assert from 'node:assert/strict';
import test from 'node:test';

import { analyticsConfig, GA4_DEFAULT_HOSTS, GA4_DEFAULT_ID } from '../src/lib/analytics.js';

test('with no settings the production property and production hostnames are used', () => {
  const cfg = analyticsConfig({});
  assert.equal(cfg.id, GA4_DEFAULT_ID);
  assert.equal(GA4_DEFAULT_ID, 'G-27Q90RBC50');
  assert.deepEqual(cfg.hosts, GA4_DEFAULT_HOSTS);
  assert.deepEqual(cfg.hosts, ['smeredithplumbing.com', 'www.smeredithplumbing.com']);
});

test('PUBLIC_GA4_ID overrides the property; "off" (any case) disables it for that build', () => {
  assert.equal(analyticsConfig({ PUBLIC_GA4_ID: 'G-TEST000000' }).id, 'G-TEST000000');
  assert.equal(analyticsConfig({ PUBLIC_GA4_ID: ' G-TEST000000 ' }).id, 'G-TEST000000');
  assert.equal(analyticsConfig({ PUBLIC_GA4_ID: 'off' }).id, '');
  assert.equal(analyticsConfig({ PUBLIC_GA4_ID: 'OFF' }).id, '');
  assert.equal(analyticsConfig({ PUBLIC_GA4_ID: '' }).id, GA4_DEFAULT_ID, 'an empty value falls back to the default, it does not silently turn analytics off');
});

test('PUBLIC_GA4_HOSTS is a trimmed, lower-cased comma list; preview and local hosts are never in the default', () => {
  assert.deepEqual(analyticsConfig({ PUBLIC_GA4_HOSTS: '127.0.0.1, LocalHost ,' }).hosts, ['127.0.0.1', 'localhost']);
  for (const host of ['127.0.0.1', 'localhost', 'smeredithplumbing.pages.dev', 'geo-audit-preview.smeredithplumbing.pages.dev']) {
    assert.ok(!GA4_DEFAULT_HOSTS.includes(host), `${host} must not send analytics by default`);
  }
});
