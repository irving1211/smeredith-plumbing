// Real-time frames of the call hero (screenshots taken at fixed times, not fast-forwarded):
//   node qa/heroes-2026-10-10/call-timeline.mjs <dist> <outDir>
// Desktop: the phone is on screen at load. Phone: the visitor scrolls to it, and the ring starts then.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch } from '../../tests/e2e/helpers.mjs';
const [dist, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { server, origin } = await serve(dist);
const browser = await launch();
const times = [300, 1200, 2200, 2700, 3300, 4300];
for (const [label, viewport, mobile] of [['desktop-1280', { width: 1280, height: 800 }, false], ['phone-390', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const p = await ctx.newPage();
  await p.goto(`${origin}/`, { waitUntil: 'networkidle' });
  if (mobile) await p.locator('[data-hc-device]').scrollIntoViewIfNeeded();
  const t0 = Date.now();
  for (const t of times) {
    const wait = t - (Date.now() - t0);
    if (wait > 0) await p.waitForTimeout(wait);
    await p.locator('[data-hc-device]').screenshot({ path: join(out, `call-${label}-${String(t).padStart(4, '0')}ms.png`) });
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log('done');
