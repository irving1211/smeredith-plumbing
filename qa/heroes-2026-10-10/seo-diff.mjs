// Compare the SEO-relevant parts of two builds page by page: title, description, robots, canonical, h1, JSON-LD types
// and key fields, internal links, Search Console tag; plus the sitemap and _redirects.
//   node qa/heroes-2026-10-10/seo-diff.mjs <beforeDist> <afterDist>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
const [A, B] = process.argv.slice(2);
const pages = (dir) => { const out = []; const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) out.push(relative(dir, p).split('\\').join('/')); } }; walk(dir); return out.sort(); };
const one = (html, re) => (html.match(re) || [])[1] || '';
const facts = (html) => ({
  title: one(html, /<title>([^<]*)<\/title>/),
  description: one(html, /<meta name="description" content="([^"]*)"/),
  robots: one(html, /<meta name="robots" content="([^"]*)"/),
  canonical: one(html, /<link rel="canonical" href="([^"]*)"/),
  h1: (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || []).map((h) => h.replace(/<[^>]+>/g, '').trim()).join(' | '),
  gsc: /google-site-verification/.test(html),
  jsonld: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { const j = JSON.parse(m[1]); return j['@type'] + (j.areaServed ? `(areaServed ${j.areaServed.length})` : '') + (j.mainEntity ? `(Q ${j.mainEntity.length})` : '') + (j.itemListElement && j['@type'] === 'BreadcrumbList' ? `(${j.itemListElement.length})` : ''); }).sort().join(', '),
  links: [...new Set([...html.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]))].filter((h) => !h.startsWith('/_astro') && !/\.(png|jpe?g|webp|avif|svg|ico|json|xml|woff2)$/.test(h)).sort(),
});
const pa = pages(A), pb = pages(B);
const all = [...new Set([...pa, ...pb])];
let changes = 0;
for (const p of all) {
  if (!pa.includes(p)) { console.log(`+ NEW PAGE ${p}`); changes++; continue; }
  if (!pb.includes(p)) { console.log(`- REMOVED PAGE ${p}`); changes++; continue; }
  const a = facts(readFileSync(join(A, p), 'utf8')), b = facts(readFileSync(join(B, p), 'utf8'));
  for (const k of Object.keys(a)) {
    if (k === 'links') {
      const lost = a.links.filter((l) => !b.links.includes(l)), gained = b.links.filter((l) => !a.links.includes(l));
      if (lost.length || gained.length) { console.log(`~ ${p} links  lost: [${lost.join(' ')}]  gained: [${gained.join(' ')}]`); changes++; }
    } else if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { console.log(`~ ${p} ${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`); changes++; }
  }
}
for (const f of ['sitemap.xml', '_redirects', 'robots.txt', '_headers']) {
  const fa = existsSync(join(A, f)) ? readFileSync(join(A, f), 'utf8') : null, fb = existsSync(join(B, f)) ? readFileSync(join(B, f), 'utf8') : null;
  console.log(`${f}: ${fa === fb ? 'identical' : 'CHANGED'}`);
}
console.log(`${pa.length} pages before, ${pb.length} after; ${changes} differences`);
