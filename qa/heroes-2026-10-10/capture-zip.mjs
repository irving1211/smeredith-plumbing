// Screenshots of the ZIP checker answers on a phone (390 x 844): node qa/heroes-2026-10-10/capture-zip.mjs <dist> <outDir>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, launch } from '../../tests/e2e/helpers.mjs';

const [dist, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const { server, origin } = await serve(dist);
const browser = await launch();
const cases = [['01906', 'covered-saugus'], ['01940', 'nearby-lynnfield'], ['02129', 'boston-confirm'], ['01001', 'outside'], ['1906', 'invalid'], ['01906', 'lookup-failed']];
for (const [zip, name] of cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  if (name === 'lookup-failed') await page.route('**/data/zip-coverage.json', (r) => r.abort());
  await page.goto(`${origin}/`);
  await page.fill('#area-zip', zip);
  await page.press('#area-zip', 'Enter');
  await page.waitForFunction(() => document.querySelector('#area [data-area-message]').textContent && document.querySelector('#area [data-area-message]').textContent !== 'Checking…');
  await page.waitForTimeout(400);
  await page.locator('#area').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('#area').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: join(out, `zip-${name}-phone-390.png`) });
  console.log(name);
  await context.close();
}
await browser.close();
server.close();
