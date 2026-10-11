# S. Meredith Plumbing & Heating — website

Static [Astro](https://astro.build) site for https://smeredithplumbing.com, with two Cloudflare Pages Functions (`/api/contact`, `/api/reviews`). Client records, research and the task board live in the vault: `ObsidianVault-v2/50-projects-client/S-Meredith-Plumbing-Shane-Trade/_context/`.

## How it is published (read this first)

The Cloudflare Pages project `smeredithplumbing` is a **direct-upload** project. `git push` does **not** deploy. Production changes only when someone runs:

```sh
npm test                      # builds, then runs the unit/build suite
npx wrangler pages deploy dist --project-name smeredithplumbing --branch main
```

Any other `--branch` value publishes a **preview** at `https://<branch>.smeredithplumbing.pages.dev` (marked `noindex` by Cloudflare). Previews share the production secrets, so **never submit the request form on a preview** unless you want Shane to get the email.

Build-time settings (`PUBLIC_*`) must be in the shell that runs `astro build`; the Cloudflare dashboard cannot change static HTML in this setup. Server secrets (Resend, Turnstile, GBP) are Pages secrets and are never in the repo.

**Rollback:** `npx wrangler pages deployment list --project-name smeredithplumbing`, then re-deploy the previous production build, or promote it in the dashboard. Before the October 2026 work the production deployment was `a5326407` (commit `6a00cfa`). The redesign (lead-gen, mobile path and request form, ZIP coverage, Incoming call hero) went live on 2026-10-11 as deployment `fa6083bb` (commit `63d0973`); to undo it, re-deploy or promote `a5326407`.

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
| `npm run optimize:images` | regenerate job photo sizes |

## Where things live

| Thing | File |
|---|---|
| Design contract (tokens, voice, assets, references, decisions) | `design/` (`design/tokens.css` is generated from `tokens.json` with the `client-design-system` skill; do not edit it by hand) |
| Pages | `src/pages/` (home, about, work, service-area, contact, thanks, services, areas, privacy, 404) |
| Header, footer, layout | `src/components/SiteHeader.astro`, `SiteFooter.astro`, `src/layouts/Base.astro`, `src/styles/` |
| Services Shane offers | `src/services.json` (service pages), `src/service-options.json` (the stable ids used by links, the form, the server, email and analytics) |
| Questions on the request form | `src/request-questions.json` (wording, options, and the one flag that lets a chosen problem replace the written description) |
| Confirmed towns | `src/service-area.json` (the only list; checker, map, schema, FAQ and form all read it) |
| Reviews shown on the site | `src/reviews.json` (verbatim excerpts; do not edit wording) |
| Jobs shown on the Work page | `src/jobs.json` and `public/images/jobs/` |
| Attribution rules | `src/lib/attribution.js` |
| Contact endpoint | `functions/api/contact.ts` |
| Live Google reviews (off until Google approves API access) | `functions/api/reviews.ts`, `src/components/LiveReviews.astro` |

## Stable ids (do not rename)

Service ids (`emergency-plumbing`, `water-heater-replacement`, `boiler-service`, `kitchen-bath-remodels`, `new-construction-plumbing`, `gas-installation`, `general-plumbing`, `not-sure`, `other`) travel through links (`/contact/?service=<id>`), the form, the server, the notification email and analytics. "How did you hear" ids are in `src/heard-about.json`. Question ids (`q_<id>`) are in `src/request-questions.json`. Renaming one breaks reports; add new ones instead.

## Optional features (all off by default)

| Feature | Build setting | Also needs |
|---|---|---|
| Google Analytics 4 | `PUBLIC_GA4_ID=G-XXXX` (or `PUBLIC_GTM_ID`) | the privacy notice approved and published; property owned by Shane's account |
| Privacy notice (page, sitemap, footer and form links) | `PUBLIC_PRIVACY_PUBLISHED=1` | Shane's approval of the wording |
| Interactive Google map (on request, on the Service area page) | `PUBLIC_GOOGLE_MAPS_KEY` | billing enabled, key restricted to the site, quota alert |
| Live Google reviews (About page) | `PUBLIC_REVIEWS_LIVE=1` | Google Business Profile API approval and the `GBP_*` Pages secrets |
| Cloudflare Turnstile on the form | `PUBLIC_TURNSTILE_SITE_KEY` | `TURNSTILE_SECRET_KEY` Pages secret (set both together) |

Server secrets: `RESEND_API_KEY` (and optional `RESEND_FROM_EMAIL`), `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `CONTACT_MAIL_PROVIDER` (see `cloudflare-mail.env.example`). Without a configured provider the form reports a delivery failure honestly and offers call, text and email.

## Rules that are enforced by tests

No page has a floating bar over content; every page has Call in the header; no unsourced business claims on the home page; no personal data in analytics or browser storage; photos carry no GPS data; titles and descriptions stay within length limits; every URL on the old site still resolves or redirects; accessibility (axe) passes on every page including the form with its questions open and in its error state; the form works without JavaScript.
