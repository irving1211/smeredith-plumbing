// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // GitHub Pages preview lives at irving1211.github.io/smeredith-plumbing/.
  // When smeredithplumbing.com cuts over, drop `base` and switch `site` back.
  site: 'https://irving1211.github.io',
  base: '/smeredith-plumbing/',
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
