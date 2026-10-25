// Zoom-out helper for Flow outputs. Flow re-draws the whole frame, so its copy of the real photo is not exact.
// This finds where the real photo sits inside Flow's wider picture, then pastes the REAL pixels back there:
// only the margin around the photo is Flow's. Reject the result if that margin shows anything but plain surface.
//   node scripts/retouch-zoomout.mjs <original> <flowOutput> <out.jpg> [featherPx]
import sharp from 'sharp';

const [orig, flow, out, featherArg] = process.argv.slice(2);
const feather = Number(featherArg || 28);

const gray = async (input, w, h) => sharp(input).rotate().resize(w, h, { fit: 'fill' }).greyscale().raw().toBuffer();
const fm = await sharp(flow).metadata();
const om = await sharp(orig).rotate().metadata();
const FW = fm.width, FH = fm.height, OW = om.width, OH = om.height;

// Normalised cross-correlation of the original (w x h, grey) against a window of the flow picture at (x, y).
function ncc(F, fw, O, ow, oh, x, y) {
  let sf = 0, so = 0, sff = 0, soo = 0, sfo = 0;
  const n = ow * oh;
  for (let j = 0; j < oh; j++) {
    const fo = (y + j) * fw + x, oo = j * ow;
    for (let i = 0; i < ow; i++) {
      const a = F[fo + i], b = O[oo + i];
      sf += a; so += b; sff += a * a; soo += b * b; sfo += a * b;
    }
  }
  const cov = sfo - (sf * so) / n, vf = sff - (sf * sf) / n, vo = soo - (so * so) / n;
  return vf > 1 && vo > 1 ? cov / Math.sqrt(vf * vo) : -1;
}

async function search(fw, widths, xr, yr) {
  const fh = Math.round(fw * FH / FW);
  const F = await gray(flow, fw, fh);
  let best = { s: -2 };
  for (const ow of widths) {
    const oh = Math.round(ow * OH / OW);
    if (ow >= fw || oh >= fh) continue;
    const O = await gray(orig, ow, oh);
    const [x0, x1] = xr ? [Math.max(0, Math.round(xr[0] * fw / xr.fw)), Math.min(fw - ow, Math.round(xr[1] * fw / xr.fw))] : [0, fw - ow];
    const [y0, y1] = yr ? [Math.max(0, Math.round(yr[0] * fh / yr.fh)), Math.min(fh - oh, Math.round(yr[1] * fh / yr.fh))] : [0, fh - oh];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const s = ncc(F, fw, O, ow, oh, x, y);
      if (s > best.s) best = { s, ow, oh, x, y, fw, fh };
    }
  }
  return best;
}

// Coarse pass on a small picture, then a fine pass around the winner.
const coarseW = 90;
const widths = [];
for (let w = Math.round(coarseW * 0.3); w < coarseW; w += 2) widths.push(w);
const c = await search(coarseW, widths);
const fineW = 360;
const k = fineW / coarseW;
const cw = c.ow * k;
const fineWidths = [];
for (let w = Math.round(cw * 0.94); w <= Math.round(cw * 1.06); w += 2) fineWidths.push(w);
const f = await search(fineW, fineWidths, { 0: c.x * k - 8, 1: c.x * k + 8, fw: fineW }, { 0: c.y * k - 8, 1: c.y * k + 8, fh: Math.round(fineW * FH / FW) });
// Scale the fine result to the flow picture's own resolution.
const r = FW / fineW;
const box = { left: Math.round(f.x * r), top: Math.round(f.y * r), width: Math.round(f.ow * r), height: Math.round(f.oh * r) };
console.log(`alignment score ${f.s.toFixed(3)} (1.0 = identical); real photo sits at`, box, `inside a ${FW}x${FH} picture (${(100 * box.width * box.height / (FW * FH)).toFixed(0)}% of the frame)`);
if (f.s < 0.6) console.log('WARNING: weak match, Flow changed the middle too much. Do not use.');

// Paste the real photo (resized to the box) over Flow's picture with a soft edge.
const real = await sharp(orig).rotate().resize(box.width, box.height, { fit: 'fill' }).removeAlpha().raw().toBuffer();
const base = await sharp(flow).removeAlpha().raw().toBuffer();
const res = Buffer.from(base);
for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
  const d = Math.min(x, y, box.width - 1 - x, box.height - 1 - y);
  const m = Math.min(1, d / feather);
  const bi = ((box.top + y) * FW + box.left + x) * 3, ri = (y * box.width + x) * 3;
  for (let ch = 0; ch < 3; ch++) res[bi + ch] = Math.round(base[bi + ch] * (1 - m) + real[ri + ch] * m);
}
await sharp(res, { raw: { width: FW, height: FH, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toFile(out);
console.log('wrote', out);
