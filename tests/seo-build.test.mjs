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
  '/service-area/',
  '/work/',
  '/about/',
  '/contact/',
];
const NOINDEX = ['/contact/thanks/', '/404.html', '/privacy/'];

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
    assert.equal(rule[1], '/about/', 'the old owner page now lands on the About page');
    assert.equal(rule[2], '301');
  }
  assert.deepEqual(find('/wp-sitemap.xml')?.slice(1), ['/sitemap.xml', '301']);
  // Google still follows the old WordPress sub-sitemaps (e.g. wp-sitemap-posts-page-1.xml).
  assert.deepEqual(find('/wp-sitemap-*')?.slice(1), ['/sitemap.xml', '301']);
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

// URL inventory taken from the build before the October 2026 redesign (17 pages). None may disappear without a redirect.
const URLS_BEFORE_REDESIGN = [
  '/', '/services/', '/services/emergency-plumbing/', '/services/water-heater-replacement/', '/services/boiler-service/',
  '/services/gas-installation/', '/services/kitchen-bath-remodels/', '/services/new-construction-plumbing/',
  '/areas/saugus/', '/areas/lynn/', '/areas/revere/', '/areas/malden/', '/areas/peabody/',
  '/contact/', '/contact/thanks/', '/privacy/', '/404.html',
];

test('every page URL that existed before the redesign still exists (nothing was removed or moved)', () => {
  for (const path of URLS_BEFORE_REDESIGN) assert.ok(existsSync(fileFor(path)), `${path} is missing from the build`);
});

test('internal links: every href on every page points at a page, file or in-page id that exists', () => {
  const broken = [];
  // path of each built page ("/about/", "/404.html") -> the set of element ids on it
  const urlOf = (file) => '/' + relative(dist, file).split(sep).join('/').replace(/index\.html$/, '');
  const pages = new Map(allHtmlFiles().map((f) => [urlOf(f), { html: readFileSync(f, 'utf8') }]));
  for (const p of pages.values()) p.ids = new Set([...p.html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const [from, { html }] of pages) {
    for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (/^(?:https?:|mailto:|tel:|sms:|data:|javascript:)/.test(href)) continue;
      const [pathPart, hash] = href.split('#');
      if (pathPart && !pathPart.startsWith('/')) { broken.push(`${from} -> ${href} (relative link)`); continue; }
      const target = pathPart ? pathPart.split('?')[0] : from;
      const isFile = /\.[a-z0-9]+$/i.test(target);
      const destPage = pages.get(target);
      if (!destPage && !(isFile && existsSync(join(dist, target.replace(/^\//, ''))))) { broken.push(`${from} -> ${href}`); continue; }
      if (hash && destPage && !destPage.ids.has(hash)) broken.push(`${from} -> ${href} (no element with id "${hash}")`);
    }
  }
  assert.deepEqual([...new Set(broken)], []);
});

// ---- GEO audit remediation (2026-10-24, report: geo-report.pdf, smeredithplumbing.com scored 62) ----
const serviceArea = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8'));
const BRAND = 'S. Meredith Plumbing & Heating';
const raw = (path) => readFileSync(join(dist, path), 'utf8');
const { homeFaqs } = await import(new URL('../src/lib/faqs.js', import.meta.url));

test('GEO: Organization, WebSite and WebPage schema carry name, logo, contact, byline and editorial dates', () => {
  const blocks = jsonLd(page('/'));
  const plumber = blocks.find((b) => b['@type'] === 'Plumber');
  const org = blocks.find((b) => b['@type'] === 'Organization');
  assert.ok(org, 'Organization schema present on home');
  assert.equal(org.name, BRAND);
  assert.equal(org.url, `${ORIGIN}/`);
  assert.equal(org.logo.url, `${ORIGIN}/images/logo.jpg`);
  assert.equal(org.telephone, '+1-781-820-4592');
  assert.equal(org.contactPoint[0].telephone, '+1-781-820-4592');
  assert.equal(org.address.addressLocality, 'Saugus');
  assert.ok(org.sameAs.length >= 2);
  assert.equal(org['@id'], plumber['@id'], 'Organization and Plumber share an @id, so JSON-LD merges them into one entity');
  assert.ok(blocks.some((b) => b['@type'] === 'WebSite' && b.name === BRAND), 'WebSite schema on home');
  assert.ok(!jsonLd(page('/about/')).some((b) => b['@type'] === 'WebSite'), 'WebSite belongs on the home page only');
  for (const path of INDEXABLE) {
    const html = page(path);
    const wp = jsonLd(html).find((b) => b['@type'] === 'WebPage');
    assert.ok(wp, `${path} WebPage schema`);
    assert.equal(wp.url, `${ORIGIN}${path}`);
    assert.equal(wp.author.name, 'Shane Meredith', `${path} byline`);
    assert.match(wp.datePublished, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(wp.dateModified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(wp.dateModified >= wp.datePublished, `${path} modified is not before published`);
    assert.equal(meta(html, 'author'), 'Shane Meredith', `${path} author meta`);
    assert.match(html, /<meta property="article:modified_time" content="\d{4}-\d{2}-\d{2}"/);
    assert.match(html, /<time datetime="\d{4}-\d{2}-\d{2}"[^>]*>/, `${path} shows a visible updated date`);
  }
  for (const path of NOINDEX) assert.ok(!jsonLd(readFileSync(fileFor(path), 'utf8')).some((b) => b['@type'] === 'WebPage'), `${path} is noindex: no WebPage`);
});

test('GEO: the business name agrees in the title, og:title, H1 and schema on the home page', () => {
  const html = page('/');
  assert.ok(title(html).startsWith(BRAND));
  assert.ok(decode(html.match(/<meta property="og:title" content="([^"]*)"/)[1]).startsWith(BRAND));
  const h1 = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, ''));
  assert.ok(h1.startsWith(BRAND), `H1 is "${h1}"`);
  assert.ok(h1.endsWith('The plumber who answers the phone.'));
  for (const b of jsonLd(html).filter((x) => ['Plumber', 'Organization', 'WebSite'].includes(x['@type']))) assert.equal(b.name, BRAND);
});

test('GEO: llms.txt, ai.txt, /ai/*.json and the feed are built from the site data and list every service and town', () => {
  const llms = raw('llms.txt');
  assert.match(llms, /^# S\. Meredith Plumbing & Heating\n\n> /);
  for (const s of services) assert.ok(llms.includes(`${ORIGIN}/services/${s.slug}/`), `llms.txt lists ${s.slug}`);
  for (const t of serviceArea.towns) assert.ok(llms.includes(t.name), `llms.txt lists ${t.name}`);
  assert.doesNotMatch(llms, /insured|same-day|free estimate|guarantee/i, 'llms.txt makes no unapproved claim');

  const ai = raw('.well-known/ai.txt');
  assert.match(ai, /^User-Agent: \*$/m);
  assert.match(ai, /^Allow: \/$/m);

  const summary = JSON.parse(raw('ai/summary.json'));
  assert.equal(summary.name, BRAND);
  assert.equal(summary.contact.phone, '781-820-4592');
  assert.deepEqual(summary.serviceArea.confirmedTowns, serviceArea.towns.map((t) => t.name));
  assert.equal(summary.services.length, services.length);

  const svc = JSON.parse(raw('ai/service.json'));
  assert.equal(svc.name, BRAND);
  assert.equal(svc.capabilities.length, services.length);
  for (const s of svc.capabilities) assert.ok(existsSync(fileFor(new URL(s.url).pathname)), `${s.url} is a real page`);

  const full = raw('llms-full.txt');
  assert.match(full, /^# S\. Meredith Plumbing & Heating\n\n> /);
  for (const s of services) assert.ok(full.includes(s.title) && full.includes(`${ORIGIN}/services/${s.slug}/`), `llms-full.txt covers ${s.slug}`);
  assert.ok(full.includes(homeFaqs()[0].a), 'llms-full.txt carries the FAQ');
  assert.ok(full.split(/\s+/).length > llms.split(/\s+/).length, 'llms-full.txt is the longer one');
  assert.match(llms, /^## Optional$/m);
  assert.ok(llms.includes(`${ORIGIN}/llms-full.txt`), 'llms.txt points at llms-full.txt');

  const faq = JSON.parse(raw('ai/faq.json'));
  const homeText = visibleText(page('/'));
  assert.ok(faq.faqs.length >= 3);
  for (const f of faq.faqs) {
    assert.ok(homeText.includes(f.question), `faq.json question is visible on the home page: ${f.question}`);
    assert.ok(homeText.includes(f.answer), `faq.json answer is visible on the home page: ${f.question}`);
  }

  const feed = raw('feed.xml');
  assert.match(feed, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<rss version="2\.0"/);
  for (const s of services) assert.ok(feed.includes(`<link>${ORIGIN}/services/${s.slug}/</link>`), `feed lists ${s.slug}`);
  assert.doesNotMatch(feed, /<pubDate>/, 'no fabricated per-item dates');
  assert.match(page('/'), /<link rel="alternate" type="application\/rss\+xml"[^>]*href="\/feed\.xml"/);
  assert.match(feed, /&amp;/, 'ampersands in titles are escaped');
});

test('GEO: robots.txt welcomes the named AI crawlers and never blocks the site', () => {
  const robots = raw('robots.txt');
  // The first five are the audit tool's citation bots: each needs its own User-agent line, not just the "*" rule.
  for (const bot of ['Googlebot', 'Applebot', 'OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'GPTBot', 'ChatGPT-User', 'ClaudeBot', 'Google-Extended']) {
    assert.match(robots, new RegExp(`^User-agent: ${bot}$`, 'm'), `${bot} is named`);
  }
  assert.doesNotMatch(robots, /^Disallow:\s*\/\s*$/m, 'the repo robots.txt never disallows the whole site');
});

test("GEO: home images all carry descriptive alt text; the owner's first name is not over-repeated", () => {
  const html = page('/');
  const imgs = html.match(/<img\b[^>]*>/g);
  assert.ok(imgs.length >= 8);
  for (const img of imgs) {
    const alt = decode((img.match(/\salt="([^"]*)"/) || [, ''])[1]);
    assert.ok(alt.length >= 10, `descriptive alt needed: ${img}`);
  }
  // The audit tool flags any single non-brand word above 2.5% of the page's 4+ letter words (and used 5+ times).
  // Its stop-word list is longer than this one, so this guard watches the words this page actually leans on.
  const body = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<noscript[\s\S]*?<\/noscript>/g, ' ');
  const words = decode(body.replace(/<[^>]+>/g, ' ')).toLowerCase().match(/\b[a-z]{4,}\b/g);
  for (const word of ['service', 'shane', 'call', 'request', 'owner']) {
    const density = (words.filter((w) => w === word).length / words.length) * 100;
    assert.ok(density <= 2.4, `"${word}" is ${density.toFixed(2)}% of the home page words (the audit flags above 2.5%)`);
  }
  assert.match(html, /<h3\b/, 'a real H3 sits under the H2s (the audit wants H2 and H3 together)');
});

test('GEO: review-region links to the platform that hosts the reviews are rel="nofollow ugc"', () => {
  for (const path of ['/', '/about/']) {
    const links = page(path).match(/<a\b[^>]*href="https:\/\/share\.google\/[^"]*"[^>]*>/g) || [];
    assert.ok(links.length >= 1, `${path} links to the Google reviews`);
    for (const a of links) assert.match(a, /rel="[^"]*\bugc\b[^"]*"/, `${path}: ${a}`);
  }
});

test('GEO: WebMCP exposes only the read-only ZIP checker, never the request form (its honeypot would drop a real lead)', () => {
  assert.match(page('/'), /<form[^>]*toolname="check_service_area"[^>]*tooldescription="[^"]+"/);
  assert.doesNotMatch(page('/contact/'), /\btoolname=/);
});

test('footer: pages that end on the dark call-to-action band close the cream gap above the footer', () => {
  // The rule lives in the footer component's CSS; the browser-level proof is in tests/e2e/pages.e2e.mjs.
  assert.match(page('/'), /main:has\(>\s*\.band\.on-dark:last-child\)\s*~\s*\.site-footer[^{]*\{[^}]*margin-top:\s*0/);
});

test('performance: every published photo is web-sized (the 12-megapixel phone originals were 2-2.7 MB each and drew ~1 GB of downloads in 30 days)', () => {
  const big = [];
  const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
  for (const file of walk(join(dist, 'images'))) {
    if (/\.(jpe?g|png)$/i.test(file) && statSync(file).size > 500_000) big.push(`${relative(dist, file)} ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
  assert.deepEqual(big, [], 'resize before adding: longest side 1600 px, JPEG quality ~78 (see README)');
});
