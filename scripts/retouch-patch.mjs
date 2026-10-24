// Keeps the real photo everywhere except small feathered boxes, where the Flow-retouched pixels replace clutter.
// node scripts/retouch-patch.mjs <original> <flowOutput> <out.jpg> "x0,y0,x1,y1;x0,y0,x1,y1"   (boxes as fractions of the image)


import sharp from 'sharp';
const [orig, flow, out, boxesArg] = process.argv.slice(2);
const o = sharp(orig).rotate();
const { width: W, height: H } = await o.metadata();
const base = await o.removeAlpha().raw().toBuffer();
const edit = await sharp(flow).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
// mask: 1 inside boxes, feathered by a blur
const mask = Buffer.alloc(W * H);
for (const b of boxesArg.split(';')) {
  const [x0, y0, x1, y1] = b.split(',').map(Number);
  for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++) for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) mask[y * W + x] = 255;
}
const soft = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).blur(14).extractChannel(0).raw().toBuffer();
const res = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const m = soft[i] / 255;
  for (let c = 0; c < 3; c++) res[i * 3 + c] = Math.round(base[i * 3 + c] * (1 - m) + edit[i * 3 + c] * m);
}
await sharp(res, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
console.log('wrote', out, W, H);
