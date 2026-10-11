// Mobile performance comparison under identical conditions: Lighthouse (performance only, default mobile emulation,
// simulated throttling), every page served from this machine by the same static server, runs interleaved round by
// round so machine noise is spread across variants. Reports medians of simulated and observed metrics.
//   node qa/heroes-2026-10-10/perf.mjs <beforeDist> <afterReviewDist> <outDir> [rounds=3]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile); // async: the static servers below live in this process and must keep answering
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../../tests/e2e/helpers.mjs';

const LH = process.env.LIGHTHOUSE_CLI || 'C:/Users/Irving/AppData/Local/npm-cache/_npx/8003d8991b0d346b/node_modules/lighthouse/cli/index.js';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const [beforeDir, afterDir, out, roundsArg] = process.argv.slice(2);
const rounds = Number(roundsArg || 3);
mkdirSync(join(out, 'raw'), { recursive: true });
const before = await serve(beforeDir);
const after = await serve(afterDir);
const targets = [
  ['home-before', before.origin + '/'],
  ['home-after', after.origin + '/'],
  ...['1', '2', '3', '4', '5'].map((id) => [`hero-${id}`, `${after.origin}/review/hero-${id}/`]),
  ['service-area-before', before.origin + '/service-area/'],
  ['service-area-after', after.origin + '/service-area/'],
];
const rows = Object.fromEntries(targets.map(([k]) => [k, []]));
for (let r = 1; r <= rounds; r++) {
  for (const [key, url] of targets) {
    const file = join(out, 'raw', `${key}-r${r}.json`);
    await run(process.execPath, [LH, url, '--only-categories=performance', '--output=json', `--output-path=${file}`, '--quiet', '--chrome-flags=--headless=new --no-first-run'], { env: { ...process.env, CHROME_PATH: CHROME }, timeout: 120000 });
    const lhr = JSON.parse(readFileSync(file, 'utf8'));
    const a = lhr.audits;
    const obs = a.metrics?.details?.items?.[0] || {};
    const lcpEl = a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet || '';
    rows[key].push({
      score: Math.round(lhr.categories.performance.score * 100),
      fcp: a['first-contentful-paint'].numericValue,
      lcp: a['largest-contentful-paint'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      tbt: a['total-blocking-time'].numericValue,
      si: a['speed-index'].numericValue,
      bytes: a['total-byte-weight'].numericValue,
      requests: a['network-requests'].details.items.length,
      obsFcp: obs.observedFirstContentfulPaint,
      obsLcp: obs.observedLargestContentfulPaint,
      lcpEl: lcpEl.slice(0, 90),
    });
    console.log(`round ${r} ${key} done`);
  }
}
before.server.close();
after.server.close();
const med = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = Object.fromEntries(Object.entries(rows).map(([k, runs]) => [k, {
  score: med(runs.map((x) => x.score)),
  fcp_ms: Math.round(med(runs.map((x) => x.fcp))),
  lcp_ms: Math.round(med(runs.map((x) => x.lcp))),
  cls: +med(runs.map((x) => x.cls)).toFixed(3),
  tbt_ms: Math.round(med(runs.map((x) => x.tbt))),
  bytes_kb: Math.round(med(runs.map((x) => x.bytes)) / 1024),
  requests: med(runs.map((x) => x.requests)),
  observed_fcp_ms: Math.round(med(runs.map((x) => x.obsFcp))),
  observed_lcp_ms: Math.round(med(runs.map((x) => x.obsLcp))),
  lcp_range_ms: `${Math.round(Math.min(...runs.map((x) => x.lcp)))}-${Math.round(Math.max(...runs.map((x) => x.lcp)))}`,
  lcp_element: runs.map((x) => x.lcpEl)[0],
}]));
writeFileSync(join(out, 'summary.json'), JSON.stringify({ tool: 'Lighthouse 12.8.2, mobile preset, simulated throttling (150 ms RTT, 1.6 Mbps, 4x CPU), local static server, runs interleaved', rounds, summary, runs: rows }, null, 2));
console.table(Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { score: v.score, fcp: v.fcp_ms, lcp: v.lcp_ms, cls: v.cls, kb: v.bytes_kb, req: v.requests, oFcp: v.observed_fcp_ms, oLcp: v.observed_lcp_ms }])));
