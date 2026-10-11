// Where the actions sit on the first screen, how big the logo is drawn, and how tall each hero is, for the live home
// and the five options, at 390 x 844 (phone) and 1280 x 800 (desktop). Settled state (after animations).
//   node qa/heroes-2026-10-10/measure-heroes.mjs <reviewDist> <out.json>
import { writeFileSync } from 'node:fs';
import { serve, launch } from '../../tests/e2e/helpers.mjs';

const [dist, out] = process.argv.slice(2);
const { server, origin } = await serve(dist);
const browser = await launch();
const pages = [['home', '/'], ...['1', '2', '3', '4', '5'].map((id) => [`hero-${id}`, `/review/hero-${id}/`])];
const result = {};
for (const [key, path] of pages) {
  result[key] = {};
  for (const [label, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    result[key][label] = await page.evaluate(() => {
      const hero = document.querySelector('.home-hero');
      const r = (el) => (el ? el.getBoundingClientRect() : null);
      const call = r(hero.querySelector('.btn-primary'));
      const req = r([...hero.querySelectorAll('a')].find((a) => a.textContent.trim() === 'Request service'));
      const logo = r(hero.querySelector('picture img'));
      const h1 = r(hero.querySelector('h1'));
      return {
        hero_height: Math.round(r(hero).height),
        h1_top: Math.round(h1.top),
        call_bottom: Math.round(call.bottom),
        request_bottom: Math.round(req.bottom),
        logo_px: logo ? `${Math.round(logo.width)}x${Math.round(logo.height)}` : 'none',
        first_service_row_visible: (() => { const row = document.querySelector('.vanlist li'); return row ? row.getBoundingClientRect().top < innerHeight : false; })(),
      };
    });
    await context.close();
  }
}
await browser.close();
server.close();
writeFileSync(out, JSON.stringify(result, null, 2));
console.table(Object.fromEntries(Object.entries(result).flatMap(([k, v]) => Object.entries(v).map(([l, m]) => [`${k} ${l}`, m]))));
