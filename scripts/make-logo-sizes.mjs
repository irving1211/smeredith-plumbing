// Resized copies of Shane's logo for the hero options. Same artwork, same proportions (720 x 710), only smaller files:
//   node scripts/make-logo-sizes.mjs
// Source: public/images/logo-full.png (owner-supplied logo, see design/ASSETS.json). Never recoloured, cropped or redrawn.
// The source was re-exported from a JPEG and carries compression noise, which is why even small copies weigh 15-40 KB;
// a clean vector original from Shane would cut this to a few KB (open owner ask in scope.md).
import sharp from 'sharp';
const src = 'public/images/logo-full.png';
for (const width of [240, 360, 480, 720]) {
  const base = `public/images/logo-hero-${width}`;
  const avif = await sharp(src).resize({ width }).avif({ quality: 50, effort: 6 }).toFile(`${base}.avif`);
  const webp = await sharp(src).resize({ width }).webp({ quality: 78, alphaQuality: 80, effort: 6 }).toFile(`${base}.webp`);
  console.log(base, `${avif.width}x${avif.height}`, `avif ${avif.size} B`, `webp ${webp.size} B`);
}
