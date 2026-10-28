# S. Meredith Plumbing & Heating — website

Static [Astro](https://astro.build) site for https://smeredithplumbing.com, with two Cloudflare Pages Functions (`/api/contact`, `/api/reviews`).

## How it is published (read this first)

The Cloudflare Pages project `smeredithplumbing` is a **direct-upload** project. `git push` does **not** deploy. Production changes only when someone runs:

```sh
npm test                      # builds, then runs the unit/build suite
npx wrangler pages deploy dist --project-name smeredithplumbing --branch main
```

Any other `--branch` value publishes a **preview** at `https://<branch>.smeredithplumbing.pages.dev` (marked `noindex` by Cloudflare). Previews share the production secrets, so **never submit the request form on a preview**: it sends a real email to the owner.

Build-time settings (`PUBLIC_*`) must be in the shell that runs `astro build`; the Cloudflare dashboard cannot change static HTML in this setup. Server secrets (mail provider, Turnstile, Google Business Profile) are Pages secrets and are never in the repo.

**Rollback:** `npx wrangler pages deployment list --project-name smeredithplumbing`, then re-deploy the previous production build, or promote it in the dashboard.

**Editorial dates:** `src/lib/site-facts.js` holds `PUBLISHED` and `UPDATED`. They feed the WebPage schema, the `article:*` meta tags, the footer's "Updated" date, `llms.txt`, the `/ai/*.json` files and the feed. They are deliberately not the build date: bump `UPDATED` only when the words or facts on the site change.

**AI-crawler access is partly a Cloudflare setting, not code.** Cloudflare's "Block AI bots" and "Managed robots.txt" zone settings can prepend `Disallow: /` for AI crawlers to the live `robots.txt` and return 403 to them, whatever `public/robots.txt` says. Check with `curl -s https://smeredithplumbing.com/robots.txt` and `curl -sI -A "GPTBot/1.1" https://smeredithplumbing.com/`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | local dev server (`localhost:4321`) |
| `npm run build` | build to `dist/` |
| `npm test` | build + unit/build tests (`tests/*.test.mjs`) |
| `npm run test:e2e` | build + browser tests (`tests/e2e/*.e2e.mjs`, needs Chrome; set `CHROME_PATH` if it is not the system Chrome) |
| `npm run test:all` | unit/build, browser, and the review-build hero tests |
| `npm run build:review` | build with the review-only hero pages into `dist-review/` (never deploy it to main) |
| `npm run build:zip` | rebuild the ZIP lookup data from Census files |
| `npm run build:geo` | rebuild the service-area outline from Census boundaries |
| `node scripts/strip-gps.mjs [--check]` | remove GPS location data from published photos (a test fails if any photo has it) |
| `npm run optimize:images` | regenerate job photo sizes (900 px and 480 px WebP; the pages use these) |

**Job photo originals** (`public/images/jobs/*/shot-N.jpg`) are not used by any page but stay because image crawlers still request them. Keep each one at 1600 px on the long side, JPEG quality about 78. A test fails if any published image is over 500 KB.

## Where things live

| Thing | File |
|---|---|
| Design contract (tokens, voice, assets, references, decisions) | `design/` (`design/tokens.css` is generated from `tokens.json`; do not edit it by hand) |
| Pages | `src/pages/` (home, about, work, service-area, contact, thanks, services, areas, privacy, 404) |
| Header, footer, layout | `src/components/SiteHeader.astro`, `SiteFooter.astro`, `src/layouts/Base.astro`, `src/styles/` |
| Services offered | `src/services.json` (service pages), `src/service-options.json` (the stable ids used by links, the form, the server, email and analytics) |
| Questions on the request form | `src/request-questions.json` |
| Confirmed towns | `src/service-area.json` (the only list; checker, map, schema, FAQ and form all read it) |
| Reviews shown on the site | `src/reviews.json` (verbatim excerpts; do not edit wording) |
| Jobs shown on the Work page | `src/jobs.json` and `public/images/jobs/` |
| Attribution rules | `src/lib/attribution.js` |
| Contact endpoint | `functions/api/contact.ts` |
| Live Google reviews (off until API access is approved) | `functions/api/reviews.ts`, `src/components/LiveReviews.astro` |

## Town pages and job photos

- **A town page exists only where there is real work to show.** `src/areas.json` holds the copy; `src/jobs.json` holds each job (`town`, `date`, `tags`, photos with `alt`). `tests/town-evidence.test.mjs` fails the build if a town page has no evidence or names a town outside `src/service-area.json`.
- **Adding a job:** put `shot-N.jpg` (long side 1600 px, metadata stripped) in `public/images/jobs/<slug>/`, add the job to `src/jobs.json` with a `photos[].original` and `alt`, then `npm run optimize:images`.
- **Service pages that reuse a form id:** a service in `src/services.json` may set `service_id` so no new id is added to `service-options.json`.

## Stable ids (do not rename)

Service ids (`emergency-plumbing`, `water-heater-replacement`, `boiler-service`, `kitchen-bath-remodels`, `new-construction-plumbing`, `gas-installation`, `general-plumbing`, `not-sure`, `other`) travel through links (`/contact/?service=<id>`), the form, the server, the notification email and analytics. "How did you hear" ids are in `src/heard-about.json`. Question ids (`q_<id>`) are in `src/request-questions.json`. Renaming one breaks reports; add new ones instead.

## Optional features

| Feature | Build setting | Also needs |
|---|---|---|
| Google Analytics 4 (on by default; property set in `src/lib/analytics.js`) | `PUBLIC_GA4_ID=off` disables it for one build; `PUBLIC_GA4_ID=G-XXXX` swaps the property; `PUBLIC_GTM_ID` replaces direct gtag. It only sends from the live domain: tests, local dev and `*.pages.dev` previews never reach Google. | |
| Privacy notice (published by default) | `PUBLIC_PRIVACY_PUBLISHED=0` withdraws it for one build; logic in `src/lib/privacy.js` | Update the "Last updated" date in `src/pages/privacy.astro` whenever its wording changes |
| Interactive Google map (on request, on the Service area page) | `PUBLIC_GOOGLE_MAPS_KEY` | billing enabled, key restricted to the site, quota alert |
| Live Google reviews (About page) | `PUBLIC_REVIEWS_LIVE=1` | Google Business Profile API approval and the `GBP_*` Pages secrets |
| Cloudflare Turnstile on the form | `PUBLIC_TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` Pages secret (set both together) |

Server secrets: `RESEND_API_KEY` (and optional `RESEND_FROM_EMAIL`), `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `CONTACT_MAIL_PROVIDER` (see `cloudflare-mail.env.example`). Without a configured provider the form reports a delivery failure honestly and offers call, text and email.

## Rules that are enforced by tests

No page has a floating bar over content; every page has Call in the header; no unsourced business claims on the home page; no personal data in analytics or browser storage; photos carry no GPS data; the license line appears on every page; titles and descriptions stay within length limits; every URL on the old site still resolves or redirects; accessibility (axe) passes on every page including the form with its questions open and in its error state; the form works without JavaScript.
