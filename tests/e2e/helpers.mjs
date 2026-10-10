// Shared browser-test helpers: a static server that behaves like Cloudflare Pages for this site,
// a Chrome launcher, and an analytics recorder that survives page navigations.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon',
};

/** Serve a built directory; unknown paths return 404.html, directories resolve to index.html. */
export function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(dir, rel);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return res.end(readFileSync(join(dir, '404.html')));
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

export async function launch() {
  const executablePath = process.env.CHROME_PATH || undefined;
  return chromium.launch(executablePath ? { executablePath, headless: true } : { channel: 'chrome', headless: true });
}

/** Phone-sized context that records every dataLayer push, even across navigations. */
export async function phoneContext(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...options });
  const events = [];
  if (options.javaScriptEnabled !== false) {
    await context.exposeFunction('__recordEvent', (json) => events.push(JSON.parse(json)));
    await context.addInitScript(() => {
      const layer = (window.dataLayer = window.dataLayer || []);
      const push = layer.push.bind(layer);
      layer.push = (...items) => {
        items.forEach((item) => window.__recordEvent(JSON.stringify(item)));
        return push(...items);
      };
    });
  }
  return { context, events };
}

export const named = (events, name) => events.filter((e) => e.event === name);

/** Fill the required fields of the request form with obviously fake data. */
export async function fillForm(page, overrides = {}) {
  const v = { name: 'Pat Example', phone: '617-555-0142', address: 'Lynn', message: 'Water heater is leaking at the base.', ...overrides };
  await page.fill('#name', v.name);
  await page.fill('#phone', v.phone);
  await page.fill('#address', v.address);
  await page.fill('#message', v.message);
  return v;
}

export const LEAD_ID = '123e4567-e89b-42d3-a456-426614174000';
