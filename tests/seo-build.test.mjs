// Regression tests for the technical/local SEO remediation (2026-10-06).
// These run against the built site in dist/, so `npm test` builds first.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const ORIGIN = 'https://smeredithplumbing.com';

const services = JSON.parse(readFileSync(join(root, 'src/services.json'), 'utf8'));
const areas = JSON.parse(readFileSync(join(root, 'src/areas.json'), 'utf8'));

const INDEXABLE = [
  '/',
  '/services/',
  ...services.map((s) => `/services/${s.slug}/`),
  ...areas.map((a) => `/areas/${a.slug}/`),
  '/contact/',
];
const NOINDEX = ['/contact/thanks/', '/404.html'];

function fileFor(path) {
  if (path.endsWith('.html')) return join(dist, path);
  return join(dist, path, 'index.html');
}
function page(path) {
  return readFileSync(fileFor(path), 'utf8');
}
function allHtmlFiles(dir = dist) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return allHtmlFiles(full);
    return name.endsWith('.html') ? [full] : [];
  });
}
function urlPathOf(file) {
  const rel = '/' + relative(dist, file).split(sep).join('/');
  return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel;
}
function decode(s) {
  return s
    .replace(/&amp;|&#38;/g, '&')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
function title(html) {
  return decode(html.match(/<title>([^<]*)<\/title>/)[1]);
}
function meta(html, name) {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? decode(m[1]) : null;
}
function canonical(html) {
  const m = html.match(/<link rel="canonical" href="([^"]*)"/);
  return m ? m[1] : null;
}
function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );
}
function visibleText(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<style[\s\S]*?<\/style>/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ');
}
function internalHrefs(html) {
  return [...html.matchAll(/href="([^"]*)"/g)]
    .map((m) => decode(m[1]))
    .filter((h) => h.startsWith('/') && !h.startsWith('//'));
}

test('build output exists', () => {
  assert.ok(existsSync(join(dist, 'index.html')), 'run `npm run build` first');
});

test('a real 404 page exists, is noindex, and has no canonical', () => {
  const html = readFileSync(join(dist, '404.html'), 'utf8');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.equal(canonical(html), null);
  assert.match(html, /href="\/services\/"/);
  assert.match(html, /href="tel:\+17818204592"/);
});

test('legacy WordPress URLs redirect permanently', () => {
  const rules = readFileSync(join(dist, '_redirects'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/));
  const find = (from) => rules.find(([f]) => f === from);
  for (const from of ['/owner', '/owner/']) {
    const rule = find(from);
    assert.ok(rule, `missing redirect for ${from}`);
    assert.equal(rule[1], '/');
    assert.equal(rule[2], '301');
  }
  assert.deepEqual(find('/wp-sitemap.xml')?.slice(1), ['/sitemap.xml', '301']);
});

test('/services/ is a real hub listing all six services', () => {
  const html = page('/services/');
  assert.equal(canonical(html), `${ORIGIN}/services/`);
  for (const s of services) assert.match(html, new RegExp(`href="/services/${s.slug}/"`));
  assert.equal(services.length, 6);
});

test('every indexable page has one h1, a self canonical, and a unique title/description within limits', () => {
  const titles = new Set();
  const descs = new Set();
  for (const path of INDEXABLE) {
    const html = page(path);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${path} h1 count`);
    assert.equal(canonical(html), `${ORIGIN}${path}`, `${path} canonical`);
    assert.doesNotMatch(html, /name="robots" content="noindex/, `${path} must be indexable`);
    const t = title(html);
    const d = meta(html, 'description');
    assert.ok(t.length <= 65, `${path} title is ${t.length} chars: ${t}`);
    assert.ok(d.length >= 120 && d.length <= 160, `${path} description is ${d.length} chars: ${d}`);
    assert.ok(!titles.has(t), `duplicate title ${t}`);
    assert.ok(!descs.has(d), `duplicate description on ${path}`);
    titles.add(t);
    descs.add(d);
  }
});

test('the owner-operator positioning is preserved', () => {
  assert.match(visibleText(page('/')), /The plumber who answers the phone\./);
});

test('utility pages are noindex and excluded from the sitemap', () => {
  for (const path of NOINDEX) {
    const html = readFileSync(fileFor(path), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex/, `${path} noindex`);
  }
});

test('sitemap lists exactly the indexable URLs with no fabricated lastmod', () => {
  const xml = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(locs, INDEXABLE.map((p) => `${ORIGIN}${p}`).sort());
  assert.doesNotMatch(xml, /<lastmod>/);
  const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap: https:\/\/smeredithplumbing\.com\/sitemap\.xml/);
});

test('structured data: no self-serving review markup, no private address, no 24h regular hours', () => {
  for (const file of allHtmlFiles()) {
    const raw = readFileSync(file, 'utf8');
    for (const block of jsonLd(raw)) {
      const s = JSON.stringify(block);
      assert.doesNotMatch(s, /aggregateRating|"review"|"Review"/, `${file} has review markup`);
      assert.doesNotMatch(s, /streetAddress/, `${file} exposes a street address`);
      assert.doesNotMatch(s, /openingHoursSpecification/, `${file} encodes regular hours`);
    }
  }
  const business = jsonLd(page('/')).find((b) => b['@type'] === 'Plumber');
  assert.ok(business, 'Plumber schema present on home');
  assert.equal(business.name, 'S. Meredith Plumbing & Heating');
  assert.equal(business.telephone, '+1-781-820-4592');
});

test('FAQPage schema only appears where every question is visibly answered', () => {
  for (const file of allHtmlFiles()) {
    const html = readFileSync(file, 'utf8');
    const faq = jsonLd(html).find((b) => b['@type'] === 'FAQPage');
    if (!faq) continue;
    const text = visibleText(html);
    for (const q of faq.mainEntity) {
      assert.ok(text.includes(q.name), `${urlPathOf(file)} FAQ question not visible: ${q.name}`);
      assert.ok(text.includes(q.acceptedAnswer.text), `${urlPathOf(file)} FAQ answer not visible`);
    }
  }
  assert.ok(jsonLd(page('/')).some((b) => b['@type'] === 'FAQPage'), 'home keeps its visible FAQ schema');
  assert.ok(!jsonLd(page('/contact/')).some((b) => b['@type'] === 'FAQPage'));
});

test('breadcrumb and service schema only reference real, indexable URLs', () => {
  const known = new Set(INDEXABLE.map((p) => `${ORIGIN}${p}`));
  for (const path of INDEXABLE.filter((p) => p !== '/')) {
    const blocks = jsonLd(page(path));
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    assert.ok(crumbs, `${path} breadcrumb schema`);
    const items = crumbs.itemListElement;
    items.forEach((it, i) => {
      assert.equal(it.position, i + 1);
      assert.ok(known.has(it.item), `${path} breadcrumb item ${it.item} is not a real page`);
    });
    assert.equal(items.at(-1).item, `${ORIGIN}${path}`);
  }
  for (const s of services) {
    const svc = jsonLd(page(`/services/${s.slug}/`)).find((b) => b['@type'] === 'Service');
    assert.equal(svc.url, `${ORIGIN}/services/${s.slug}/`);
    assert.ok(known.has(svc.url));
  }
});

test('internal linking connects home, services hub, services, towns and contact', () => {
  const home = internalHrefs(page('/'));
  assert.ok(home.includes('/services/'));
  for (const s of services) {
    const links = internalHrefs(page(`/services/${s.slug}/`));
    assert.ok(links.includes('/services/'), `${s.slug} -> hub`);
    assert.ok(links.includes('/contact/'), `${s.slug} -> contact`);
    assert.ok(areas.some((a) => links.includes(`/areas/${a.slug}/`)), `${s.slug} -> towns`);
    assert.ok(services.some((o) => o.slug !== s.slug && links.includes(`/services/${o.slug}/`)), `${s.slug} -> related`);
  }
  for (const a of areas) {
    const links = internalHrefs(page(`/areas/${a.slug}/`));
    assert.ok(links.includes('/contact/'), `${a.slug} -> contact`);
    for (const s of services) assert.ok(links.includes(`/services/${s.slug}/`), `${a.slug} -> ${s.slug}`);
  }
  const hub = internalHrefs(page('/services/'));
  for (const a of areas) assert.ok(hub.includes(`/areas/${a.slug}/`), `hub -> ${a.slug}`);
});

test('every internal link resolves to a built page or asset', () => {
  const broken = [];
  for (const file of allHtmlFiles()) {
    for (const href of internalHrefs(readFileSync(file, 'utf8'))) {
      const path = href.split('#')[0].split('?')[0];
      if (!path || path === '/api/contact') continue;
      const target = path.endsWith('/') ? join(dist, path, 'index.html') : join(dist, path);
      if (!existsSync(target)) broken.push(`${urlPathOf(file)} -> ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('images declare dimensions and gallery photos are lazy, optimized files', () => {
  for (const file of allHtmlFiles()) {
    const html = readFileSync(file, 'utf8');
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\swidth="\d+"/, `${urlPathOf(file)} img missing width: ${img}`);
      assert.match(img, /\sheight="\d+"/, `${urlPathOf(file)} img missing height: ${img}`);
      assert.match(img, /\salt="/, `${urlPathOf(file)} img missing alt: ${img}`);
      const src = img.match(/\ssrc="([^"]+)"/)[1];
      if (src.includes('/images/jobs/')) {
        assert.match(img, /loading="lazy"/, `gallery image should be lazy: ${src}`);
        const bytes = statSync(join(dist, src)).size;
        assert.ok(bytes < 250_000, `${src} is ${bytes} bytes`);
      }
    }
  }
});

test('conversion tracking: event hooks present, no third-party tags unless configured', () => {
  const home = page('/');
  assert.match(home, /data-track-events/);
  assert.doesNotMatch(home, /googletagmanager\.com|google-analytics\.com|clarity\.ms/);
  const contact = page('/contact/');
  assert.match(contact, /<select[^>]*name="heard_about"/);
  for (const option of ['Google Search', 'Google Maps', 'Referral', 'Facebook', 'Instagram', 'Contractor or property manager', 'Previous customer', 'Other']) {
    assert.ok(contact.includes(`>${option}<`), `missing heard_about option ${option}`);
  }
  for (const field of ['utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'referrer']) {
    assert.match(contact, new RegExp(`name="${field}"`));
  }
  assert.match(page('/contact/thanks/'), /data-page-type="lead-confirmation"/);
});
