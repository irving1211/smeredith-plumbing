// node scripts/strip-gps.mjs [--check]
// Finds published photos that carry GPS coordinates and removes the EXIF/XMP block losslessly (no re-encode,
// nothing deleted). --check only reports and exits 1 if any are found. A photo that relies on EXIF orientation
// is refused rather than silently rotated wrong.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasGps, jpegOrientation, stripJpegMetadata } from './lib/image-metadata.mjs';

const root = fileURLToPath(new URL('../public', import.meta.url));
const check = process.argv.includes('--check');
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

let found = 0;
for (const file of walk(root).filter((f) => /\.(jpe?g|webp)$/i.test(f))) {
  const buf = readFileSync(file);
  if (!hasGps(buf)) continue;
  found++;
  const rel = relative(root, file);
  if (check) { console.log(`GPS found: ${rel}`); continue; }
  if (!/\.jpe?g$/i.test(file)) { console.log(`GPS found in ${rel} (not a JPEG: re-export it without location data)`); continue; }
  if (jpegOrientation(buf) !== 1) { console.log(`REFUSED ${rel}: it relies on EXIF orientation; re-export it instead`); continue; }
  const clean = stripJpegMetadata(buf);
  if (hasGps(clean)) { console.log(`FAILED to strip ${rel}`); continue; }
  writeFileSync(file, clean);
  console.log(`stripped ${rel}: ${buf.length} -> ${clean.length} bytes`);
}
if (!found) console.log('no GPS metadata in published images');
process.exit(check && found ? 1 : 0);
