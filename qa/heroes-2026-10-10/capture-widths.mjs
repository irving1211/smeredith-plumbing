// First-screen captures at extra widths: node qa/heroes-2026-10-10/capture-widths.mjs <dist> <outDir> <width,...> <page...>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch } from '../../tests/e2e/helpers.mjs';
const [dist, out, widths, ...pages] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { server, origin } = await serve(dist);
const browser = await launch();
for (const pg of pages) {
  for (const w of widths.split(',').map(Number)) {
    const ctx = await browser.newContext({ viewport: { width: w, height: Math.round(w * 0.62) } });
    const p = await ctx.newPage();
    await p.goto(`${origin}/${pg === 'home' ? '' : pg + '/'}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(3300);
    await p.screenshot({ path: join(out, `${pg.replace(/\//g, '-')}-${w}.png`) });
    await ctx.close();
  }
}
await browser.close();
server.close();
console.log('done');
