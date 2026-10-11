// Screenshot one element at phone and desktop width: node qa/heroes-2026-10-10/capture-el.mjs <dist> <outDir> <page> <selector> <name>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch } from '../../tests/e2e/helpers.mjs';
const [dist, out, pg, sel, name] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { server, origin } = await serve(dist);
const browser = await launch();
for (const [label, viewport, mobile] of [['phone-390', { width: 390, height: 844 }, true], ['desktop-1280', { width: 1280, height: 800 }, false]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(`${origin}/${pg === 'home' ? '' : pg + '/'}`, { waitUntil: 'networkidle' });
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(4500); // let anything that starts on scroll finish
  await el.screenshot({ path: join(out, `${name}-${label}.png`) });
  await ctx.close();
}
await browser.close();
server.close();
console.log('done');
