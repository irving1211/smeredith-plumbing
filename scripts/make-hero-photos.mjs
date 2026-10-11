// Responsive crops of Shane's own photos for the hero options (AVIF + WebP). Crops only: no retouching, no generated
// content. GPS is not carried over (sharp drops metadata unless asked to keep it).
//   node scripts/make-hero-photos.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const out = 'public/images/hero';
mkdirSync(out, { recursive: true });

// [name, source, crop box in source pixels (after EXIF rotation) or null for the whole frame, widths, extra pipeline]
const jobs = [
  // The van at blue hour: whole frame for wide screens, and a 4:5 crop on the lettering + decal for phones.
  ['van-wide', 'public/images/van/van-side.jpg', null, [960, 1600]],
  ['van-tall', 'public/images/van/van-side.jpg', { left: 470, top: 250, width: 960, height: 900 }, [480, 640, 800, 960]],
  // Boiler + tank + zone manifold (job "Boiler Manifold Mechanical Room").
  ['manifold', 'public/images/jobs/boiler-manifold-room/shot-1.jpg', { left: 0, top: 160, width: 2160, height: 2700 }, [480, 680, 840, 1120, 1600]],
  // Same job ("Kitchen & Bath Remodel"): rough stage and the finished kitchen, cropped to the same 4:5 frame.
  ['rough', 'public/images/jobs/kitchen-bath-remodel/shot-3.jpg', { left: 640, top: 0, width: 1728, height: 2160 }, [480, 680, 840, 1120]],
  ['finished', 'public/images/jobs/kitchen-bath-remodel/shot-2.jpg', { left: 0, top: 180, width: 2160, height: 2700 }, [480, 680, 840, 1120]],
  // Owner portrait (supplied by Shane), black and white, contrast lifted; colour is added in CSS.
  ['owner', 'public/images/shane.jpg', { left: 160, top: 120, width: 1600, height: 2000 }, [480, 600, 720, 960], (s) => s.grayscale().linear(1.18, -18)],
  // A soft wallpaper for the phone option: twin water heaters, heavily blurred (decorative, tiny).
  ['wallpaper', 'public/images/jobs/twin-water-heaters/shot-1.jpg', null, [480], (s) => s.blur(18).modulate({ brightness: 0.55, saturation: 0.6 })],
];

for (const [name, src, crop, widths, extra] of jobs) {
  for (const w of widths) {
    let s = sharp(src).rotate();
    if (crop) s = s.extract(crop);
    s = s.resize({ width: w });
    if (extra) s = extra(s);
    const buf = await s.toBuffer();
    const a = await sharp(buf).avif({ quality: name === 'wallpaper' ? 40 : 48, effort: 6 }).toFile(`${out}/${name}-${w}.avif`);
    const b = await sharp(buf).webp({ quality: 74, effort: 6 }).toFile(`${out}/${name}-${w}.webp`);
    console.log(`${name}-${w}`, `${a.width}x${a.height}`, `avif ${Math.round(a.size / 1024)} KB`, `webp ${Math.round(b.size / 1024)} KB`);
  }
}
