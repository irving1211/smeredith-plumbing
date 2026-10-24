// Compares a Flow-retouched image with the original photo: where did pixels change? node scripts/retouch-diff.mjs <original> <retouched> <out.jpg>


import sharp from 'sharp';
const [orig, edit, out] = process.argv.slice(2);
const m = await sharp(edit).metadata();
const W = m.width, H = m.height;
const blur = (s) => s.blur(2);
const a = await blur(sharp(orig).rotate().resize(W, H, { fit: 'fill' })).removeAlpha().raw().toBuffer();
const b = await blur(sharp(edit).removeAlpha()).raw().toBuffer();
const d = Buffer.alloc(W * H);
let changed = 0;
for (let i = 0; i < W * H; i++) {
  const diff = (Math.abs(a[i * 3] - b[i * 3]) + Math.abs(a[i * 3 + 1] - b[i * 3 + 1]) + Math.abs(a[i * 3 + 2] - b[i * 3 + 2])) / 3;
  d[i] = Math.min(255, diff * 4);
  if (diff > 28) changed++;
}
console.log(`size ${W}x${H}; pixels differing by >28/255 after blur: ${(100 * changed / (W * H)).toFixed(2)}%`);
// Side-by-side: edit with the difference map as a red overlay, plus the raw diff.
const diffImg = await sharp(d, { raw: { width: W, height: H, channels: 1 } }).resize(400, Math.round(400 * H / W)).jpeg({ quality: 80 }).toBuffer();
const editSmall = await sharp(edit).resize(400, Math.round(400 * H / W)).jpeg({ quality: 80 }).toBuffer();
const origSmall = await sharp(orig).rotate().resize(400, Math.round(400 * H / W), { fit: 'fill' }).jpeg({ quality: 80 }).toBuffer();
const h = Math.round(400 * H / W);
await sharp({ create: { width: 1220, height: h, channels: 3, background: '#fff' } })
  .composite([{ input: origSmall, left: 0, top: 0 }, { input: editSmall, left: 410, top: 0 }, { input: diffImg, left: 820, top: 0 }])
  .jpeg({ quality: 80 }).toFile(out);
