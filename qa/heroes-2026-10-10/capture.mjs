// Screenshots of built pages at phone (390x844) and desktop (1280x800).
//   node qa/heroes-2026-10-10/capture.mjs <distDir> <outDir> <prefix> <path> [path...]
// Captures the first screen at both sizes plus a full phone page. Reduced motion is OFF by default so the
// screenshot shows the settled state after animations; pass --reduced to emulate prefers-reduced-motion.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch } from '../../tests/e2e/helpers.mjs';

const args = process.argv.slice(2);
const reduced = args.includes('--reduced');
const nojs = args.includes('--nojs');
const [dist, out, prefix, ...rawPaths] = args.filter((a) => !a.startsWith("--"));
// Paths are given as "home", "service-area", "review/hero-1" (no leading slash: Git Bash rewrites "/x" into a Windows path).
const paths = rawPaths.map((p) => (p === "home" ? "/" : `/${p.replace(/^\/+|\/+$/g, "")}/`));
mkdirSync(out, { recursive: true });
const { server, origin } = await serve(dist);
const browser = await launch();
const slug = (p) => p.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
for (const path of paths) {
  for (const [label, viewport, mobile] of [['phone-390', { width: 390, height: 844 }, true], ['desktop-1280', { width: 1280, height: 800 }, false]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced ? 'reduce' : 'no-preference', javaScriptEnabled: !nojs });
    const page = await context.newPage();
    await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(4600); // let any one-shot animation settle (the call hero finishes at about 4.1 s)
    const name = `${prefix}-${slug(path)}-${label}`;
    await page.screenshot({ path: join(out, `${name}-first-screen.png`) });
    if (mobile) await page.screenshot({ path: join(out, `${name}-full.png`), fullPage: true });
    console.log(name);
    await context.close();
  }
}
await browser.close();
server.close();
