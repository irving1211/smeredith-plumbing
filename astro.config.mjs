// @ts-check
import { defineConfig } from 'astro/config';

const isGithubPages = process.env.GITHUB_PAGES === 'true' || process.env.GITHUB_REPOSITORY?.includes('smeredith-plumbing');

export default defineConfig({
  // Production: served at the root of smeredithplumbing.com (Vercel).
  // GitHub Pages preview can be enabled via env override or automatically in GitHub actions.
  site: isGithubPages ? 'https://irving1211.github.io' : 'https://smeredithplumbing.com',
  base: isGithubPages ? '/smeredith-plumbing/' : '/',
  trailingSlash: 'always',
  server: {
    host: '0.0.0.0',
    port: 4322,
    allowedHosts: true,
  },
  vite: {
    server: {
      allowedHosts: true,
    },
  },
});
