// Lead-source classification: never invents a source, never calls an unknown source "Google organic".
import assert from 'node:assert/strict';
import test from 'node:test';

import { classifySource, cleanReferrer, cleanToken, GBP_UTM } from '../src/lib/attribution.js';

test('the tagged Google Business Profile link is its own source, distinct from organic search', () => {
  const r = classifySource({ utmSource: GBP_UTM.source, utmMedium: GBP_UTM.medium, utmCampaign: GBP_UTM.campaign, referrer: 'https://www.google.com/' });
  assert.equal(r.id, 'gbp_tagged');
  assert.match(r.label, /Google Business Profile/);
});

test('the legacy proposed GBP tag (google/organic/gbp-website) is still recognised as GBP', () => {
  const r = classifySource({ utmSource: 'google', utmMedium: 'organic', utmCampaign: 'gbp-website', referrer: '' });
  assert.equal(r.id, 'gbp_tagged');
});

test('an untagged Google referral is NOT labelled organic search or Maps', () => {
  const r = classifySource({ referrer: 'https://www.google.com/' });
  assert.equal(r.id, 'google_referral');
  assert.doesNotMatch(r.label, /organic/i);
  assert.match(r.label, /not distinguishable|untagged/i);
});

test('no tag and no referrer is direct/unknown, not Google', () => {
  for (const input of [{}, { referrer: '' }, { utmSource: '', referrer: '' }]) {
    const r = classifySource(input);
    assert.equal(r.id, 'direct_or_unknown');
    assert.doesNotMatch(r.label, /google/i);
  }
});

test('other tagged campaigns keep their own source/medium/campaign', () => {
  const r = classifySource({ utmSource: 'facebook', utmMedium: 'social', utmCampaign: 'bio-link' });
  assert.equal(r.id, 'tagged_campaign');
  assert.match(r.label, /facebook/);
  assert.match(r.label, /social/);
  assert.match(r.label, /bio-link/);
});

test('search-engine, social and site referrals are classified by host', () => {
  assert.equal(classifySource({ referrer: 'https://www.bing.com/' }).id, 'search_referral');
  assert.equal(classifySource({ referrer: 'https://duckduckgo.com/' }).id, 'search_referral');
  assert.equal(classifySource({ referrer: 'https://l.facebook.com/l.php' }).id, 'social_referral');
  assert.equal(classifySource({ referrer: 'https://l.instagram.com/' }).id, 'social_referral');
  const site = classifySource({ referrer: 'https://www.somecontractor.com/preferred-trades' });
  assert.equal(site.id, 'site_referral');
  assert.match(site.label, /somecontractor\.com/);
});

test('look-alike hosts are not mistaken for Google', () => {
  assert.equal(classifySource({ referrer: 'https://notgoogle.com/' }).id, 'site_referral');
  assert.equal(classifySource({ referrer: 'https://google.com.evil.example/' }).id, 'site_referral');
});

test('referrer is reduced to origin + path (no query or fragment) and junk is dropped', () => {
  assert.equal(cleanReferrer('https://www.google.com/search?q=plumber+near+me&x=1#frag'), 'https://www.google.com/search');
  assert.equal(cleanReferrer('not a url'), '');
  assert.equal(cleanReferrer('javascript:alert(1)'), '');
  assert.equal(cleanReferrer(''), '');
});

test('tokens are trimmed, de-controlled and length-limited', () => {
  assert.equal(cleanToken('  hello\u0000\u0007world  ', 50), 'helloworld');
  assert.equal(cleanToken('x'.repeat(500), 100).length, 100);
  assert.equal(cleanToken(undefined, 10), '');
});
