// Build the site WITH the review-only hero pages (/review/...) into dist-review/.
//   node scripts/build-review.mjs [--out dist]
// Production builds (npm run build) never contain /review/. Deploy dist-review only to a preview branch.
import { spawnSync } from 'node:child_process';
const i = process.argv.indexOf('--out');
const outDir = i > -1 ? process.argv[i + 1] : 'dist-review';
const result = spawnSync('npx', ['astro', 'build', '--outDir', outDir], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, PUBLIC_REVIEW_ROUTES: '1' },
});
process.exit(result.status ?? 1);
