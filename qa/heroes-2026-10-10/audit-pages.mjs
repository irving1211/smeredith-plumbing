// Run the frontend-quality-review objective audit on each page of a build (the audit tool takes one URL at a time).
//   node qa/heroes-2026-10-10/audit-pages.mjs <distDir> <outDir> <page...>   (pages like "home", "review/hero-1")
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { serve } from '../../tests/e2e/helpers.mjs';
const require = createRequire(import.meta.url);
const { audit } = require('C:/Users/Irving/.claude/skills/frontend-quality-review/scripts/lib/audit.js');
const [dist, out, ...pages] = process.argv.slice(2);
const { server, origin } = await serve(dist);
const summary = [];
for (const p of pages) {
  const path = p === 'home' ? '/' : `/${p}/`;
  const r = await audit({ target: `${origin}${path}`, out: join(out, p.replace(/\//g, '-')), designDir: 'design', breakpoints: [390, 768, 1280] });
  summary.push(`${path}  ${r.verdict}  P0 ${r.counts.P0} P1 ${r.counts.P1} P2 ${r.counts.P2} P3 ${r.counts.P3}`);
}
server.close();
console.log(summary.join('\n'));
