// Side-by-side contact sheet of screenshots: node qa/heroes-2026-10-10/sheet.mjs <out.png> <scale> <img...>
import sharp from 'sharp';
const [out, scale, ...files] = process.argv.slice(2);
const imgs = await Promise.all(files.map(async (f) => { const m = await sharp(f).metadata(); const w = Math.round(m.width * scale), h = Math.round(m.height * scale); return { buf: await sharp(f).resize(w, h).toBuffer(), w, h }; }));
const gap = 12, W = imgs.reduce((a, i) => a + i.w + gap, gap), H = Math.max(...imgs.map((i) => i.h)) + gap * 2;
let x = gap;
await sharp({ create: { width: W, height: H, channels: 3, background: '#888' } }).composite(imgs.map((i) => { const c = { input: i.buf, left: x, top: gap }; x += i.w + gap; return c; })).png().toFile(out);
console.log(out, W, H);
