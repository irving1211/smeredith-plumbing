// The site hides the owner's home address, so no published photo may carry GPS coordinates.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { hasGps, jpegOrientation, stripJpegMetadata } from '../scripts/lib/image-metadata.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

// A minimal JPEG whose EXIF carries a GPS pointer (tag 0x8825) and an orientation tag.
function jpegWith({ gps, orientation }) {
  const entries = [];
  if (orientation) entries.push([0x0112, 3, 1, orientation << 16]);
  if (gps) entries.push([0x8825, 4, 1, 26]);
  const tiff = Buffer.alloc(8 + 2 + entries.length * 12 + 4);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const o = 10 + i * 12;
    tiff.writeUInt16BE(tag, o); tiff.writeUInt16BE(type, o + 2); tiff.writeUInt32BE(count, o + 4); tiff.writeUInt32BE(value >>> 0, o + 8);
  });
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.alloc(4); app1.writeUInt8(0xff, 0); app1.writeUInt8(0xe1, 1); app1.writeUInt16BE(exif.length + 2, 2);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, exif, sos]);
}

test('the GPS detector finds a GPS block, ignores other EXIF, and the stripper removes it without touching image data', () => {
  const tagged = jpegWith({ gps: true, orientation: 6 });
  assert.equal(hasGps(tagged), true);
  assert.equal(hasGps(jpegWith({ gps: false, orientation: 6 })), false, 'orientation alone is not GPS');
  assert.equal(hasGps(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), false);
  assert.equal(jpegOrientation(tagged), 6);
  const clean = stripJpegMetadata(tagged);
  assert.equal(hasGps(clean), false);
  assert.ok(clean.subarray(-6).equals(Buffer.from([0x12, 0x34, 0xff, 0xd9]).subarray(0)) || clean.includes(Buffer.from([0x12, 0x34, 0xff, 0xd9])), 'scan data and end marker are intact');
  assert.ok(clean.length < tagged.length);
});

test('no published or built photo carries GPS coordinates', () => {
  const offenders = [];
  for (const dir of ['public', 'dist']) {
    let files;
    try { files = walk(join(root, dir)); } catch { continue; }
    for (const f of files.filter((f) => /\.(jpe?g|webp)$/i.test(f))) {
      if (hasGps(readFileSync(f))) offenders.push(relative(root, f));
    }
  }
  assert.deepEqual(offenders, [], 'run: node scripts/strip-gps.mjs');
});
