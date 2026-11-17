// Makes a Google Business Profile photo/post pack from job photos already on the site.
// Usage: node scripts/make-gbp-post-pack.mjs <out-dir> <slug:shot:name> ...
// For each item it writes <name>.jpg (the whole photo, for the profile Photos section) and <name>-post.jpg
// (a 1200 x 900 crop for posts; sharp's "attention" crop keeps the busiest part of the frame), plus contact-sheet.jpg.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const [out, ...items] = process.argv.slice(2);
if (!out || items.length === 0) throw new Error('usage: make-gbp-post-pack.mjs <out-dir> <slug:shot:name> ...');
mkdirSync(out, { recursive: true });
const thumbs = [];
for (const item of items) {
  const [slug, shot, name] = item.split(':');
  const src = join('public/images/jobs', slug, `shot-${shot}.jpg`);
  await sharp(src).rotate().jpeg({ quality: 85 }).toFile(join(out, `${name}.jpg`));
  const post = await sharp(src).rotate().resize(1200, 900, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 85 }).toBuffer();
  await sharp(post).toFile(join(out, `${name}-post.jpg`));
  thumbs.push(await sharp(post).resize(400, 300).toBuffer());
}
const cols = 3;
const rows = Math.ceil(thumbs.length / cols);
await sharp({ create: { width: cols * 410, height: rows * 310, channels: 3, background: '#ffffff' } })
  .composite(thumbs.map((input, i) => ({ input, left: (i % cols) * 410 + 5, top: Math.floor(i / cols) * 310 + 5 })))
  .jpeg({ quality: 80 })
  .toFile(join(out, 'contact-sheet.jpg'));
console.log(`wrote ${items.length} photos + crops + contact-sheet.jpg to ${out}`);
