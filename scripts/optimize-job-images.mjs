// Generates web-sized WebP copies (900 px and 480 px) of the gallery photos referenced in src/jobs.json.
// Originals are left untouched. Re-run after adding a job: `node scripts/optimize-job-images.mjs`
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const jobsPath = join(root, 'src/jobs.json');
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));
const WIDTH = 900;

for (const job of jobs) {
  const originals = job.photos?.map((p) => p.original) ?? job.images;
  job.photos = [];
  for (const original of originals) {
    const input = join(root, 'public', original);
    const output = original.replace(/\.(jpe?g|png)$/i, `-${WIDTH}.webp`);
    const outPath = join(root, 'public', output);
    if (!existsSync(outPath)) {
      await sharp(input).rotate().resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(outPath);
    }
    // A 480 px copy for small slots (service-page job cards render at about 236 px).
    const smallPath = outPath.slice(0, -`-${WIDTH}.webp`.length) + '-480.webp';
    if (!existsSync(smallPath)) await sharp(input).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(smallPath);
    const { width, height } = await sharp(outPath).metadata();
    job.photos.push({ src: output, width, height, original });
  }
  delete job.images;
}

writeFileSync(jobsPath, JSON.stringify(jobs, null, 2) + '\n');
console.log(`Optimized ${jobs.reduce((n, j) => n + j.photos.length, 0)} gallery photos.`);
