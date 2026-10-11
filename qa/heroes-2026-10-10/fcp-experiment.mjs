// First-paint experiment: same page, CSS overrides injected into the HTML, 4x CPU throttle, median of N loads.
//   node qa/heroes-2026-10-10/fcp-experiment.mjs <dist> <path> <runs>
import { serve, launch } from '../../tests/e2e/helpers.mjs';
const [dist, rawPath, runsArg] = process.argv.slice(2);
const path = rawPath === 'home' ? '/' : `/${rawPath}/`; // no leading slash on the command line (Git Bash rewrites it)
const runs = Number(runsArg || 7);
const variants = {
  asis: '',
};
const { server, origin } = await serve(dist);
const browser = await launch();
const results = {};
for (let r = 0; r < runs; r++) {
  for (const [name, css] of Object.entries(variants)) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2.6, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    if (css) await page.route(`${origin}${path}`, async (route) => { const res = await route.fetch(); const body = (await res.text()).replace('</head>', `<style>${css}</style></head>`); await route.fulfill({ response: res, body }); });
    await page.goto(`${origin}${path}`, { waitUntil: 'load' });
    const fcp = await page.evaluate(() => new Promise((res) => new PerformanceObserver((l) => { const e = l.getEntries().find((x) => x.name === 'first-contentful-paint'); if (e) res(e.startTime); }).observe({ type: 'paint', buffered: true })));
    (results[name] ||= []).push(fcp);
    await ctx.close();
  }
}
await browser.close();
server.close();
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(18), 'median FCP', Math.round(med(v)), 'ms', JSON.stringify(v.map(Math.round)));
