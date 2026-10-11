// Builds the ZIP lookup used by the coverage checker from U.S. Census Bureau files (public domain).
//   node scripts/build-zip-coverage.mjs [--cache <dir>]
// Output (commit it; the site build never touches the network): public/data/zip-coverage.json
//
// Sources (2020 Census geography, the latest ZCTA-to-town relationship the Bureau publishes):
//   - ZCTA5 (2020) to County Subdivision (2020) relationship file: which Massachusetts cities/towns each ZIP Code
//     Tabulation Area overlaps, with the land area of each overlap.
//     https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_cousub20_natl.txt
//   - 2024 Gazetteer ZCTA file: an internal point (latitude/longitude) for each ZCTA, used only for the approximate pin.
//     https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip
//
// Limits, stated so nobody mistakes this for postal truth:
//   - ZCTAs approximate USPS ZIP delivery areas; PO-box-only and single-business ZIPs have no ZCTA, so they are
//     reported as "not found" and the visitor is asked to call or pick a town.
//   - A ZIP's mailing-city name is not its municipality (01960 is mailed "Peabody" but also reaches other towns);
//     this file records the municipalities by land area, never the postal name.
//   - Coverage is NOT decided here. src/service-area.json (owner-confirmed towns) decides it at run time.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REL_URL = 'https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_cousub20_natl.txt';
const GAZ_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip';
const MIN_SHARE = 1; // percent of the ZIP's land; smaller slivers are boundary noise and are dropped

const cacheArg = process.argv.indexOf('--cache');
const cache = cacheArg > -1 ? process.argv[cacheArg + 1] : join(root, '.cache', 'census');
mkdirSync(cache, { recursive: true });

async function download(url, file) {
  const path = join(cache, file);
  if (!existsSync(path)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  return path;
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const relPath = await download(REL_URL, 'tab20_zcta520_cousub20_natl.txt');
const gazZip = await download(GAZ_URL, '2024_Gaz_zcta_national.zip');
const gazPath = join(cache, '2024_Gaz_zcta_national.txt');
if (!existsSync(gazPath)) execFileSync('tar', ['-xf', gazZip, '-C', cache]); // tar reads zip on Windows 10+, macOS and Linux (bsdtar)

// "Lynn city" -> "Lynn"; "Methuen Town city" -> "Methuen"; "Manchester-by-the-Sea town" -> "Manchester-by-the-Sea"
const townName = (namelsad) => namelsad.replace(/\s+(?:Town city|city|town)$/i, '').trim();
const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- relationship file: ZCTA -> Massachusetts municipalities by land area ----
const rel = readFileSync(relPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/);
const header = rel[0].split('|');
const col = (name) => header.indexOf(name);
const C = {
  zcta: col('GEOID_ZCTA5_20'), zLand: col('AREALAND_ZCTA5_20'), cousub: col('GEOID_COUSUB_20'),
  cName: col('NAMELSAD_COUSUB_20'), part: col('AREALAND_PART'),
};
if (Object.values(C).some((i) => i < 0)) throw new Error('relationship file columns changed');

const zips = new Map(); // zcta -> { land, parts: Map(slug -> land) }
const towns = new Map(); // slug -> name
for (const line of rel.slice(1)) {
  if (!line) continue;
  const f = line.split('|');
  const zcta = f[C.zcta];
  if (!zcta || !f[C.cousub].startsWith('25')) continue; // Massachusetts county subdivisions only
  const name = townName(f[C.cName]);
  if (/not defined/i.test(name)) continue;
  const slug = slugOf(name);
  towns.set(slug, name);
  const z = zips.get(zcta) || { land: Number(f[C.zLand]), parts: new Map() };
  z.parts.set(slug, (z.parts.get(slug) || 0) + Number(f[C.part]));
  zips.set(zcta, z);
}

// ---- gazetteer: internal point per ZCTA ----
const gaz = new Map();
for (const line of readFileSync(gazPath, 'utf8').split(/\r?\n/).slice(1)) {
  const f = line.trim().split(/\t/);
  if (f.length >= 7) gaz.set(f[0], [Number(f[5]), Number(f[6])]);
}

const out = {};
let skipped = 0;
for (const [zcta, z] of [...zips].sort(([a], [b]) => a.localeCompare(b))) {
  if (!z.land) { skipped++; continue; } // water-only
  const parts = [...z.parts]
    .map(([slug, land]) => [slug, Math.round((land / z.land) * 100)])
    .filter(([, pct]) => pct >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1]);
  if (!parts.length) { skipped++; continue; }
  const pt = gaz.get(zcta);
  out[zcta] = [pt ? +pt[0].toFixed(3) : null, pt ? +pt[1].toFixed(3) : null, ...parts.flat()];
}

// Every owner-confirmed town must exist in the Census names, or coverage would silently fail.
const confirmed = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8')).towns;
for (const t of confirmed) if (!towns.has(t.slug)) throw new Error(`confirmed town ${t.slug} not found in Census names`);

const usedTowns = new Set(Object.values(out).flatMap((v) => v.slice(2).filter((x) => typeof x === 'string')));
const data = {
  _comment: 'Generated by scripts/build-zip-coverage.mjs. Do not hand-edit. Geography only: coverage is decided by src/service-area.json.',
  source: 'U.S. Census Bureau: 2020 ZCTA5-to-County-Subdivision relationship file (land-area overlaps) and 2024 Gazetteer ZCTA internal points. Public domain.',
  sources: [
    { url: REL_URL, sha256: sha256(relPath) },
    { url: GAZ_URL, sha256: sha256(gazZip) },
  ],
  format: 'zips[zip] = [lat, lon, townSlug, percentOfZipLand, townSlug, percent, ...] (largest share first, slivers under 1% dropped)',
  towns: Object.fromEntries([...towns].filter(([slug]) => usedTowns.has(slug)).sort(([a], [b]) => a.localeCompare(b))),
  zips: out,
};
mkdirSync(join(root, 'public/data'), { recursive: true });
const target = join(root, 'public/data/zip-coverage.json');
writeFileSync(target, JSON.stringify(data));
console.log(`${Object.keys(out).length} Massachusetts ZCTAs, ${Object.keys(data.towns).length} towns, ${skipped} skipped; ${readFileSync(target).length} bytes`);
