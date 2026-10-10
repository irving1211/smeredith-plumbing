// Build-output checks for the conversion path: stable service ids, town carry-through,
// one canonical town list, and no third-party loads unless explicitly configured.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const services = JSON.parse(readFileSync(join(root, 'src/services.json'), 'utf8'));
const areas = JSON.parse(readFileSync(join(root, 'src/areas.json'), 'utf8'));
const options = JSON.parse(readFileSync(join(root, 'src/service-options.json'), 'utf8'));
const { towns } = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8'));
const heard = JSON.parse(readFileSync(join(root, 'src/heard-about.json'), 'utf8'));

const page = (path) => readFileSync(join(dist, path, 'index.html'), 'utf8');
const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));
function allHtml(dir = dist) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return allHtml(full);
    return name.endsWith('.html') ? [full] : [];
  });
}

test('every service page has a service id that exists in the shared option list', () => {
  const ids = new Set(options.map((o) => o.id));
  for (const s of services) assert.ok(ids.has(s.slug), `${s.slug} missing from service-options.json`);
  for (const id of ids) {
    if (!services.some((s) => s.slug === id)) assert.ok(['general-plumbing', 'other', 'not-sure'].includes(id), `${id} has no page and is not a catch-all`);
  }
  assert.equal(options.filter((o) => o.default).length, 1, 'exactly one default option');
});

test('service-page CTAs carry the service id into the request form', () => {
  for (const s of services) {
    const links = hrefs(page(`/services/${s.slug}`));
    const withService = links.filter((h) => h === `/contact/?service=${s.slug}`);
    assert.ok(withService.length >= 2, `${s.slug}: hero and closing CTA should both carry ?service= (found ${withService.length})`);
    for (const h of links.filter((h) => h.startsWith('/contact/?service='))) {
      assert.equal(h, `/contact/?service=${s.slug}`, `${s.slug} links to a different service id: ${h}`);
    }
  }
});

test('service-page text link carries the service name', () => {
  for (const s of services) {
    const sms = hrefs(page(`/services/${s.slug}`)).find((h) => h.startsWith('sms:'));
    assert.ok(sms, `${s.slug} has a text link`);
    assert.ok(decodeURIComponent(sms).includes(s.title), `${s.slug} text link names the service`);
  }
});

test('town-page CTAs carry the town into the request form', () => {
  for (const a of areas) {
    const links = hrefs(page(`/areas/${a.slug}`));
    assert.ok(links.filter((h) => h === `/contact/?town=${a.slug}`).length >= 2, `${a.slug} CTAs should carry ?town=`);
  }
});

test('the contact form offers exactly the shared service and heard-about ids; nothing is pre-chosen for the visitor', () => {
  const html = page('/contact');
  const radios = [...html.matchAll(/<input type="radio" name="service_type" value="([^"]*)"[^>]*>/g)];
  assert.deepEqual(radios.map((m) => m[1]).sort(), options.map((o) => o.id).sort());
  assert.ok(radios.every((m) => !/\bchecked\b/.test(m[0])), 'no service is checked until the visitor (or the page they came from) chooses');
  assert.equal(options.find((o) => o.default).id, 'not-sure', 'a request that names no service is recorded as not sure');
  const select = html.match(/<select[^>]*name="heard_about"[^>]*>([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...select.matchAll(/<option[^>]*value="([^"]*)"/g)].map((m) => m[1]), ['', ...heard.map((h) => h.id)]);
  assert.ok(heard.some((h) => h.id === 'not-sure') && heard.some((h) => h.id === 'other'), 'attribution offers Not sure and Other');
  assert.match(html, /name="town_other"|data-towns=/, 'form knows how to map town slugs');
  for (const field of ['utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'referrer', 'latest_utm_source', 'latest_utm_medium', 'latest_utm_campaign']) {
    assert.match(html, new RegExp(`name="${field}"`), `${field} hidden field`);
  }
});

test('the form needs no more required fields than before (name, phone, town, message)', () => {
  const html = page('/contact');
  const form = html.match(/<form[\s\S]*?<\/form>/)[0];
  const required = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\brequired\b[^>]*name="([^"]+)"|<(?:input|select|textarea)\b[^>]*name="([^"]+)"[^>]*\brequired\b/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(required.sort(), ['address', 'message', 'name', 'phone']);
});

test('the form posts to the same-origin endpoint and degrades to a plain POST without JavaScript', () => {
  const form = page('/contact').match(/<form[^>]*>/)[0];
  assert.match(form, /action="\/api\/contact"/);
  assert.match(form, /method="POST"/i);
  assert.match(form, /enctype="multipart\/form-data"/);
});

test('one canonical town list drives schema, the checker and the FAQ', () => {
  const names = towns.map((t) => t.name);
  const home = page('/');
  const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const business = blocks.find((b) => b['@type'] === 'Plumber');
  assert.deepEqual(business.areaServed.map((a) => a.name.replace(/, MA$/, '')), names);
  for (const t of towns) {
    assert.ok(new RegExp(`<option value="${t.slug}"[^>]*>${t.name}</option>`).test(home), `checker option for ${t.slug}`);
    assert.ok(new RegExp(`data-town="${t.slug}"`).test(page('/service-area')), `map outline for ${t.slug}`);
  }
  const faq = blocks.find((b) => b['@type'] === 'FAQPage').mainEntity.find((q) => q.name === 'What areas do you serve?');
  for (const n of names.slice(1)) assert.ok(faq.acceptedAnswer.text.includes(n), `FAQ lists ${n}`);
  for (const s of services) {
    const svc = JSON.parse(page(`/services/${s.slug}`).match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"Service"[\s\S]*?)<\/script>/)[1]);
    assert.deepEqual(svc.areaServed.map((a) => a.name.replace(/, MA$/, '')), names);
  }
});

test('the checker works without JavaScript: a GET form to the request page, with the service carried', () => {
  const home = page('/');
  const form = home.match(/<form class="area-form"[^>]*>/)[0];
  assert.match(form, /action="\/contact\/"/);
  assert.match(form, /method="get"/);
  const boiler = page('/services/boiler-service');
  assert.match(boiler, /<input type="hidden" name="service" value="boiler-service"/);
});

test('the map shows real outlines for every confirmed town and states what the colours mean', () => {
  const home = page('/service-area');
  for (const t of towns) {
    const d = home.match(new RegExp(`data-town="${t.slug}"[^>]*d="([^"]+)"`))?.[1] || home.match(new RegExp(`d="([^"]+)"[^>]*data-town="${t.slug}"`))?.[1];
    assert.ok(d && d.length > 60, `${t.slug} has a real outline path`);
  }
  assert.match(home, /Towns on Shane&#39;s confirmed list|Towns on Shane's confirmed list/);
  assert.match(home, /U\.S\. Census Bureau/);
  assert.doesNotMatch(home, /street-address|residential address/i, 'no address shown or requested');
});

test('no third-party scripts load unless a key is configured at build time', () => {
  for (const file of allHtml()) {
    const html = readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /<script[^>]+src="https?:\/\/(?!static\.cloudflareinsights)/, `${file} loads an external script`);
    assert.doesNotMatch(html, /maps\.googleapis\.com|challenges\.cloudflare\.com|googletagmanager|google-analytics/, `${file} references a third party`);
  }
  assert.doesNotMatch(page('/'), /data-gmap-open/, 'no map button without a Maps key');
});

test('lead counting happens only on a server-confirmed thank-you visit', () => {
  const html = page('/contact/thanks');
  assert.match(html, /searchParams|URLSearchParams/);
  assert.match(html, /sm_leads_counted/);
  assert.match(html, /history\.replaceState/);
  assert.doesNotMatch(html, /sm_lead_pending/, 'the old client-side flag must be gone');
  assert.doesNotMatch(html, /name|phone|email|message/i.test('') ? '' : /smTrack\([^)]*(name|phone|email|message)\b/, 'no personal fields in the event call');
  assert.match(html, /noindex/);
});

test('the request page reports attempts and errors honestly and never calls an attempt a lead', () => {
  const html = page('/contact');
  assert.match(html, /form_submit_attempt/);
  assert.match(html, /form_error/);
  assert.doesNotMatch(html, /'generate_lead'/);
  assert.match(html, /Your answers are still in the form/);
});

test('first-touch attribution is never overwritten and a later campaign is kept separately', () => {
  const html = page('/');
  assert.match(html, /stored\.first/);
  assert.match(html, /stored\.latest/);
});

test('static assets get long-lived caching and the site is not frameable by other origins', () => {
  assert.ok(existsSync(join(dist, '_headers')));
  const headers = readFileSync(join(dist, '_headers'), 'utf8');
  assert.match(headers, /\/_astro\/\*\s+Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers, /X-Frame-Options: SAMEORIGIN/);
});

test('the homepage has no reveal animation: every section is readable as soon as it is painted', () => {
  const html = page('/');
  assert.doesNotMatch(html, /class="[^"]*\breveal\b/);
  assert.doesNotMatch(html, /IntersectionObserver\(\[|querySelectorAll\('section, \.work-card/);
  assert.doesNotMatch(html, /opacity:\s*0\b/);
});

test('webfonts: only the heading font is preloaded (preloading Inter measured slower to first paint); no static Inter weights or retired serif ship', () => {
  for (const path of ['/', '/contact', '/services/boiler-service']) {
    const html = page(path);
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+.woff2)"/g)].map((m) => m[1]);
    assert.equal(preloads.length, 1, `${path} preloads`);
    assert.match(preloads[0], /barlow-condensed-latin-700-normal/);
    // the body font is still shipped, just not preloaded
    assert.match(html, /inter-latin-wght-normal[^"']*.woff2/, `${path} still references the variable Inter file`);
  }
  const fonts = readdirSync(join(dist, '_astro')).filter((f) => /^inter-latin-d{3}-normal/.test(f));
  assert.deepEqual(fonts, [], 'static Inter weights should not be in the build');
  assert.deepEqual(readdirSync(join(dist, '_astro')).filter((f) => /fraunces/i.test(f)), [], 'the retired serif is not shipped');
});

test('priority service pages answer real customer questions without prices, promises or new claims', () => {
  const qaSlugs = ['water-heater-replacement', 'boiler-service', 'kitchen-bath-remodels', 'new-construction-plumbing'];
  for (const slug of qaSlugs) {
    const html = page(`/services/${slug}`);
    const section = html.match(/<section class="homeowner-qa"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section, `${slug} has the Q&A section`);
    const text = section.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok((section.match(/<h3/g) || []).length >= 3, `${slug} has at least three questions`);
    assert.doesNotMatch(text, /\$\s?\d|\d\s?(dollars|USD)|\bwarrant(y|ies)\b.*\d+\s?(year|yr)/i, `${slug} must not state prices or warranty terms`);
    assert.doesNotMatch(text, /guarantee|always|never fail|within the hour|lowest price|cheapest/i, `${slug} must not add promises`);
    assert.match(section, new RegExp(`href="/contact/\\?service=${slug}"`), `${slug} Q&A CTA carries the service id`);
    assert.doesNotMatch(section, /\{\{|\}\}/, `${slug} has unresolved link markers`);
  }
  // marked-up internal links point at real service pages
  const boiler = page('/services/boiler-service');
  assert.match(boiler, /href="\/services\/emergency-plumbing\/"[^>]*>emergency page</);
  assert.match(page('/services/water-heater-replacement'), /href="\/services\/boiler-service\/"/);
  // gas and emergency pages are deliberately untouched until their facts are confirmed
  for (const slug of ['gas-installation', 'emergency-plumbing']) assert.doesNotMatch(page(`/services/${slug}`), /<section class="homeowner-qa"/);
});

test('the privacy notice is prepared but unpublished: noindex, not in the sitemap, linked from nowhere', () => {
  const html = page('/privacy');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(readFileSync(join(dist, 'sitemap.xml'), 'utf8'), /privacy/);
  for (const file of allHtml()) {
    if (file.endsWith(join('privacy', 'index.html'))) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), /href="\/privacy\/"/, `${file} links to the unpublished notice`);
  }
});

test('the privacy notice describes what this build really does, and nothing it does not do', () => {
  const html = page('/privacy');
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
  for (const must of ['Cloudflare Web Analytics', 'sets no cookies of its own', 'session storage', 'random confirmation code', 'emailed to Shane', 'never your search words']) {
    assert.ok(text.includes(must), `missing: ${must}`);
  }
  // features that are not built in must not be described as if they were
  for (const mustNot of ['Google Analytics', 'Show interactive map', 'retrieved from Shane', 'Cloudflare Turnstile']) {
    assert.ok(!text.includes(mustNot), `default build must not mention: ${mustNot}`);
  }
  assert.doesNotMatch(text, /we (do not|don't) sell/i, "a business-practice promise needs Shane's confirmation first");
});

test('the request form says plainly where the details go (without linking an unpublished notice)', () => {
  assert.match(page('/contact'), /What you enter is emailed to Shane so he can answer your request\./);
});
