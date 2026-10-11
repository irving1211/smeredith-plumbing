---
schema_version: 1
client: S. Meredith Plumbing & Heating
project: smeredith-plumbing
version: 1.1.0
status: client-review
approved_by: null
approved_at: null
last_updated: 2026-10-10
stack: astro
mode: redesign
visitor_mode: operate
page_objective: A homeowner on a phone names the problem, confirms Shane serves their town and reaches Shane by call or a short request
primary_conversion: Server-accepted service request (counted once, on the confirmation page), with call and text as equal alternatives
---

# Design System — S. Meredith Plumbing & Heating

> Project-local and client-specific. Built with the `client-design-system` skill (method: its `references/design-method.md`). Tokens live in `tokens.json` (rendered to `tokens.css`); copy rules in `VOICE.md`; assets in `ASSETS.json`; references in `REFERENCES.md`. Mode: **redesign** of the live site; shipped values that were kept are named as such.

## Brand goals

1. **Be reachable by the person who answers.** Shane runs the company himself and customers describe him with verbs (responded, fixed, explained, arrived). Evidence: the live "The plumber who answers the phone." line, the 10 verbatim review excerpts, `_context/scope.md`.
2. **Turn a search or a map tap into a complete, low-effort request.** Evidence: the measurement plan counts requests by service; the old form needed a typed description every time; the live homepage was about 24,200 px (29 phone screens) before the first service list ended.
3. **Look like the van and the logo, not like a plumbing template.** Evidence: the logo's colours and wordmark, the van's plain service list.
4. **Say only what Shane has confirmed.** Evidence: `VOICE.md` approved-claims table; the unsourced live claims are listed for his answer.

## Target customers

Homeowners and small landlords in Saugus, the North Shore and Boston, usually on a phone, often with something wrong right now (no heat, leak, no hot water) or comparing a planned job (water heater, boiler, remodel, addition). On the first screen they need three things without scrolling: who this is, a way to call, and a way to say what they need. They leave when the first screen is a wall of claims, when the call button is below the fold, when they cannot tell whether Shane covers their town, or when a form asks for typing they cannot do with wet or gloved hands. Property managers (one review) want the same speed.

## Page objective and primary conversion

- **Objective:** get the visitor to Shane by the lowest-effort route that fits their situation.
- **Primary conversion:** a server-accepted service request. It is counted once, on the confirmation page, from a random lead id, never from a click. Call-button taps are recorded as taps, not calls.
- **Equal alternatives:** call and text are in the header on every page, in the hero, and above the form. They are never behind form completion.
- **Success signals to review after launch:** `form_start` → `form_submit_attempt` → `generate_lead` by `service_type`; call and text taps by page; qualified, estimate, booked and revenue states in the lead tracker. No lift is claimed until there is data.

## Subject-grounded direction

- **Visitor mode:** operate (complete a task: get help).
- **Distinctive premise:** the page is Shane's van list. The van carries his own plain list of the work and his number, readable from a driveway; the home page reads the same way, and every line is a link that starts a request with that service already chosen.
- **Premise evidence:** `public/images/van/van-side.jpg` (lettering: Remodels, Boilers, New Construction, Furnaces, General Plumbing, Water Heaters, plus the logo decal and 781-820-4592); transcription in `assets/refs/van-side-list.txt`.
- **Category rut being rejected:** the centered hero with a pulsing "24/7 emergency" pill, three check-mark trust bullets, a stats strip, a grid of numbered service cards, a rotating gallery, a ten-card review wall and a red call-to-action band, topped by a floating call pill. That is exactly what the previous version of this site was.
- **Macrostructure A (chosen), "Van list", task first:** header with Call and Menu → one-sentence promise with Call and Request → "What do you need?" ruled list (each row opens the form with the service chosen; "Details" opens the service page) → two review excerpts → Meet Shane → one real job → check your town → three short answers → call/text/request band. Long about, gallery and coverage content live on About, Work and Service area.
- **Macrostructure B (rejected), "Owner-led, story first":** full-bleed Shane portrait with the promise over it → Meet Shane + van → recent work → reviews → services as a compact list → closing call and request.
- **Chosen and why (measured on real-copy wireframes at 390 × 844, see decision log):** A shows Call, Request service and the first service row on the first screen and totals 3.8 screens; B shows only Call, puts the first service link 3,453 px down and the request button 3,890 px down (4.9 screens), and the headline over the photo collides with the logo on Shane's shirt. The visitor's job is to start a request, so the structure that starts it on the first screen wins; B's strengths (the person, the van) are kept lower in A.
- **Signature detail (one):** the ruled service list in the logo's condensed type, with a red underline on each service name (the logo's rule lines, reused), instead of cards.
- **Same-category swap test:** the list is Shane's own wording and order, the headline is his, the palette and type come from his logo; handing this page to another plumber would require replacing the list, the headline, the logo, the photos and the type.
- **Silhouette test:** blurred, the page is a left-aligned headline, two buttons, a long ruled list, short quotes, one photo and a dark band; it does not read as hero + three cards + band.

## Color roles

Source of every value is in `tokens.json`; checked ratios (WCAG 2.2, computed by `ds.js check`):

| Role | Token | Hex | Source | Checked pairs |
|---|---|---|---|---|
| Page background | `bg` | #FAF9F6 | Shipped site CSS, kept | text 12.36 · muted 6.65 · action 4.80 |
| Surface (fields, cards, header) | `surface` | #FFFFFF | White field of logo and van | text 13.01 · muted 7.00 |
| Text, headings, dark band | `text` / `dark` | #313131 | Logo charcoal, sampled (48.7% of the logo) | white on it 13.01 |
| Secondary text | `text-muted` | #595959 | Logo charcoal lightened to pass AA | — |
| Primary action | `action` | #D32B2C | Logo red, sampled (24.0%); within 2 steps of the shipped red | white on it 5.06 |
| Action hover, error text | `action-hover` | #B11F20 | Logo red darkened | white on it 6.80 |
| Review stars | `star` | #B5791A | Shipped gold darkened | 3.49 on bg (non-text) |
| Information tint | `tint` | #F6E4E2 | Logo red at 10% over bg | text 10.60 |
| Form-control border | `control` | #8A8A8A | Charcoal mixed with white to just pass 3:1 | 3.45 surface · 3.28 bg |
| Hairlines | `border` | #D8D4CB | Shipped paper tone darkened | decorative only |
| Focus ring | `focus` | #313131 | Logo charcoal, 3 px with 2 px offset | 12.36 bg · 13.01 surface |

Colour carries information only: red marks actions and errors, the tint marks the chosen service, the emergency note and the error summary. Nothing is tinted for decoration.

## Typography

- **Display:** Barlow Condensed 700 (SIL OFL 1.1), uppercase, one 22 KB file, for h1/h2, buttons, the wordmark and the service names. It is the closest open-licence match to the heavy condensed gothic of the "S. MEREDITH" wordmark; the logo's own face is unknown, so this is an echo, not the logo font.
- **Body:** Inter Variable (SIL OFL 1.1), one 48 KB file, kept from the shipped site. Reflex-Inter is a flagged pattern; it is retained on purpose for reading text and forms because it is already preloaded and measured, and the brand voice now comes from the display face.
- **Retired:** Fraunces (the serif sub-line) and the red underlined emphasis word in headlines.
- **Scale:** h1 clamp(2.7rem, 9.5vw, 4.5rem); h2 clamp(2rem, 6.5vw, 2.9rem); service names 1.75rem; body 17px / 1.55; reading column ≤ 40rem.

## Spacing and layout grid

4 px base (4, 8, 12, 16, 24, 32, 48, 64). Container 72rem with 16 px gutters on phones and 24 px from 768 px. Sections separated by a 1 px rule and 2–3.25rem of space, not by tinted bands. The form column is 44rem. Desktop home hero: copy 1.15fr, portrait 0.85fr, from 900 px.

## Buttons and calls to action

- Primary (red): Call. Secondary (white, charcoal 2 px border): Request service, Text. On the dark band: ghost-dark. Height ≥ 48 px (header and compact rows ≥ 44 px), radius 6 px, Barlow Condensed uppercase.
- Labels come from `VOICE.md`: "Call 781-820-4592", "Request service", "Text Shane" / "Text photos", "Send request".
- States: hover darkens (red) or fills (secondary); focus is a 3 px charcoal outline with 2 px offset (white on dark); disabled while sending ("Sending…").
- Call and Request are in the header on every page. There is no floating or sticky bar on phones; the header is not sticky on phones and is sticky from 900 px.

## Forms

The pattern was chosen from evidence (`_context/form-pattern-research-2026-10-10.md`): a compact single page of native controls with simple conditional questions.

- Labels always visible; "(optional)" marks optional fields; required fields are unmarked and the order is service → questions → how soon → town → name → phone → email → description → photo → street (collapsed) → how heard.
- Service is a radio group (9 choices including Not sure and Something else, nothing pre-chosen). When the service comes from another page it is shown as one line with a Change button.
- Questions: one radio group per service (two for water heaters), always with a Don't know / Something else way out. A chosen real answer to the "issue" question replaces the written description; "Something else" and "Don't know" do not.
- Autofill and keyboards: `name`, `tel`/`inputmode=tel`, `email`/`inputmode=email`, `address-level2`, `address-line1`; the form never sets autocomplete off; no `type=number`.
- Errors: validate on send; one summary at the top that takes focus and links to each field, the same words beside each field, `aria-invalid`, "Error:" in the page title; every answer kept; server failures explained honestly with call, text and email routes.
- Sending: the button is disabled and says "Sending…"; the page only says "sent" after the server accepted it; a request id makes a repeat or retry harmless.
- Spam: honeypot, rate limit, link limit and optional Turnstile are server-side and unchanged in spirit; nothing here asks the visitor to prove anything.
- No customer details are written to browser storage or analytics.

## Cards and components

Only what the site needs, each with a job: the ruled service list (navigation + request start), quote blocks with a red rule (proof), the service tile and chip (form choices), the chosen-service line, the notice (emergency / prefill), the dark contact band, the photo strip (jobs). No card grids; no pills or badges without an informational job.

## Photography and illustration

Real photos only. **The current portrait is no longer on the home page (2026-10-10): Shane does not like it.** The home hero is copy only (or one of the review hero options) and the "Meet Shane" strip shows the van; the portrait remains on About until Shane supplies a replacement or says to remove it (owner question). Other real photos: the van (About), and job photos (one on the home page, all on Work, grouped by service). Job photos keep their caption text and show customer homes without identifying details. GPS metadata is stripped and a test keeps it that way. No generated or stock imagery. Hero options use code-drawn SVG only (handset, pipe runs, fittings, fixtures, valve, wrench and, in option 5, a simple original plumber figure); none is a photo, a stock asset or a likeness of Shane.

## Icons

None in the interface. (The hero options' drawings are illustrations, not an icon set.) Arrows and chevrons are avoided; the red underline and the `+`/`−` of the answers list are drawn with text and CSS. If an icon is ever needed it must be a single SVG set.

## Motion

Live pages: tier **none**. No scroll reveals, no fades, no parallax, no auto-advancing anything. Colour changes on hover and focus only; `prefers-reduced-motion` is honoured by the generated token file.

Candidate (hero options only, review pages, `tokens.json` → `motion.candidate`): **brief-once**. CSS only, no library and no script; decorative drawings only; plays once on load and ends within 1.4 s; never loops, never flashes, no sound; the heading, text, buttons and the logo image never move or fade; the resting state is the design, shown at once with `prefers-reduced-motion: reduce` or when animations do not run. Tested in `tests/e2e/heroes.review.mjs` (animation count and end times, zero animations with reduced motion, layout shift < 0.01, heading and Call button never move).

## Accessibility

WCAG 2.2 AA targets, enforced by tests: axe (serious/critical) on all pages and on the form with its questions open and in its error state; keyboard completion of the form; visible 3 px focus; skip link; one h1 per page and ordered headings; 44 px touch targets (24 px minimum controls); radio groups in `fieldset`/`legend`; a polite live region announces revealed questions and the town result; errors are linked and described; text is never baked into images; links have text names; the page works at 320 px without sideways scroll. Screen-reader testing with NVDA/VoiceOver is not done here and is listed as a follow-up (GOV.UK reports revealed-question announcement is imperfect, so reveals stay simple).

## Mobile behavior

Designed at 390 px first and checked at 320, 390, 820 and 1280. The header is Brand · Call · Menu (a native `<details>` menu that works without script). The hero fits Call and Request on the first screen; the first service row is visible without scrolling. Service choice collapses to one line when it came from another page, so the form starts at the questions. No bottom bar; nothing is fixed over content or the keyboard.

## SEO-sensitive design

One h1 per page; titles ≤ 65 and descriptions 120–160 characters (tested); canonical on every indexable page; every URL from the previous site is kept (old `/owner` now 301s to `/about/`); the new pages (About, Work, Service area) are in the sitemap; text is real HTML; the largest contentful paint (checked 2026-10-10) is the headline on the phone home page, the portrait on the desktop home page and About, and text on the form and service pages; the NAP (name, 781-820-4592, Saugus, license number) is in the header, footer and structured data; structured data carries no review or rating markup and no street address; FAQ markup is emitted only for visible answers and no rich-result is promised.

## Trust and proof

Only real, confirmed proof: the license number as Shane gave it, two verbatim review excerpts on the home page (all ten on About, with the live Google reviews widget ready but off until Google approves access), job photos Shane supplied, Shane's portrait and the van. Not used: insurance, same-day, free-quote, callback, "stocked van", commercial, payment-method and "5-star" rating claims, none of which have a source in the client records (listed for Shane in `VOICE.md`).

## Prohibited patterns

Everything in `design-method.md` §5, plus for this client: pulsing "live" dots and emergency pills, centered heroes, check-mark trust bullets, stat strips, numbered card grids, rotating carousels, scroll-reveal animation, sticky or floating call bars, uppercase tracked eyebrow labels, a red accent word inside a headline, tinted rounded icon squares, gradient or glass effects, any claim not in the approved-claims table, any "licensed and insured" wording, AI/automation wording on customer-facing pages, and any third-party widget that blocks the first screen or the form.

## Hero options (review, 2026-10-10)

Brief: `_context/claude-hero-coverage-prompt-2026-10-10.md`. Five working openings for Irving to choose from; **none is approved and none is live**. They are built only into the review build (`npm run build:review`: `/review/` and `/review/hero-1/` to `/hero-5/`), noindex and out of the sitemap. The live home keeps a copy-only hero (`src/components/heroes/HeroBaseline.astro`).

Shared by every option (`src/components/HeroCopy.astro`, `LogoPicture.astro`): the h1 "The plumber who answers the phone.", the existing lede (services, Saugus/North Shore/Boston, 24/7), Call 781-820-4592 and Request service; Shane's logo exactly as supplied (`logo-full.png`, 720 x 710), only resized (`scripts/make-logo-sizes.mjs`), never cropped, recoloured or redrawn. Evidence studied: the logo (charcoal and red, a house between two crossed pipe wrenches, wordmark band, phone number in the red base) and the van side (bold italic bullet list, logo decal, "License #9630040" by the door).

| # | Composition and hierarchy | Visual story | Evidence used |
|---|---|---|---|
| 1 | Phone: drawing band above the copy. Desktop: copy left, drawing right | A ringing receiver, a red line through a pipe and two bends, arriving at the logo | Logo (pipe wrenches, red/charcoal), the brand line |
| 2 | Full-width charcoal band; logo on a white plate (like the decal on the white van) beside a desk phone; copy in white | The receiver lifts off its cradle: the call is answered | Logo, van decal on white |
| 3 | Grid-paper band; riser-diagram drawing first (desktop: left), copy after | Leak, no hot water and no heat pipe into one line, through a valve, to the logo | Services Shane offers (heaters, boilers, general), the logo |
| 4 | Copy first, then a white "van side" panel: bullet list, logo decal, license line, pipe and wrench along the bottom | Reads like Shane's van | Van lettering transcription (Furnaces left off pending S5) |
| 5 | Drawing and logo side by side above the copy (desktop: left of the copy) | A simple, original plumber lifts a phone to his ear | The brand line; **proposed brand extension, needs Shane's approval; not his likeness** |

Comparison, screenshots and measurements: `qa/heroes-2026-10-10/` and the vault report `_context/hero-coverage-implementation-2026-10-10.md`.

## Coverage checker (2026-10-10)

ZIP first: one text field (`inputmode=numeric`, `autocomplete=postal-code`, never `type=number`, so 01906 keeps its zero), a Check button, then a result box with the answer, an approximate pin on the town-outline map (a dashed circle around the ZIP's Census internal point, captioned "approximate centre ... not your address") and the next action. Confirmed towns: "Yes — request service" (red) carrying the service and the town. Everything else: "Call Shane to confirm" (red) with a request as the secondary action; never a refusal. The town picker sits behind "No ZIP handy? Pick your town"; without JavaScript a plain town picker and the phone number replace the ZIP box. Towns with pages stay in an expandable list of plain links for search engines. Logic: `src/lib/zip-coverage.js`; data: `public/data/zip-coverage.json` (Census, see ASSETS).

## Decision log

- 2026-10-10 — v1.0.0 created (redesign mode). Status `draft`; moved to `client-review` with a desktop and mobile preview.
- 2026-10-10 — **Structure selection.** Two macrostructures built as real-copy wireframes and measured at 390 × 844. A: call, request and first service row on the first screen, 3.8 screens, 3,231 px. B: call only on the first screen, first service link at 3,453 px, request at 3,890 px, 4.9 screens, 4,135 px; headline overlaps the shirt logo. A selected. (Wireframe numbers are before final content and styling.)
- 2026-10-10 — Palette taken from the logo (charcoal #313131, red #D32B2C sampled) in place of the shipped near-black #111111 and slate greys; the shipped off-white background and Inter are kept. Display face changed from Inter 900 + Fraunces to Barlow Condensed 700 + Inter. Contrast of the shipped red/greys was acceptable; the change is brand fit, not a contrast fix, except `control` borders (shipped hairlines were about 1.4:1).
- 2026-10-10 — Not carried to the redesigned pages: unsourced claims (see `VOICE.md`). They remain in the older service-page and town-page copy until Shane answers; that copy was out of scope for this redesign.

- 2026-10-10 — **Font loading.** Interleaved A/B on a throttled phone (4x CPU, 9 Mbps, 9 runs, local): preloading both fonts painted the home page at a median 796-820 ms, the previous build at 628-656 ms; preloading only the heading font 708-712 ms; preloading neither 244 ms but with layout shift up to 0.076 (a button moving under a thumb). **Chosen: preload both fonts (zero layout shift).** The heading-font-only variant was built and measured in Lighthouse on the preview: it moved the simulated mobile first paint from 0.94 s to 1.4 s on the home page and added small layout shifts (0.019-0.026) on two service pages when the body font swapped in late, so it was reverted. The two methods disagree by about 100 ms in opposite directions, which is inside their noise; the choice favours no movement. The new build is ahead of the previous one in three milder settings (4x CPU/no throttle: 424 vs 524 ms; 1x CPU/4G: 288 vs 308 ms; 1x/none: 136 vs 160 ms) and about 170 ms behind it in the harshest (home, 4x CPU + 9 Mbps). Raw tables: perf results folder, recorded in the implementation notes.

### Keep / change / remove (redesign audit, measured 2026-10-10 on the build before this redesign)

| Element | Current | Evidence it works or fails | Decision | Why |
|---|---|---|---|---|
| Headline "The plumber who answers the phone." | h1, with a red underlined "who answers" | Customers describe Shane by what he does; accent word is a flagged pattern | keep wording, remove accent | Brand line is real; emphasis styling was decoration |
| Phone number in header and hero | Header number + hero button, call button below the first screen on a phone | Hero was 2,066 px tall; Call started at ~y=765 of 844 | keep, move up | Primary alternative must be on the first screen |
| Mobile page length | 24,225 px (28.7 screens) | Measured at 390 px | change | 78% of it was sections that are not needed to start a request |
| Hero extras (duplicate logo, "live" pill, check-mark bullets, stats strip, "friction-free" line, payment methods) | 5 stacked blocks | Same-category swap fails; payment line contradicts Shane's preference not to publish payment methods | remove | Decoration and unsourced claims |
| Trust band, "Why Shane" cards, emergency band | 548 + 1,716 + 471 px of claims | Claims have no source (insured, same-day, free quotes, 1-hour callback) | remove from home | Not confirmed; the call button already says 24/7 |
| Services as 6 numbered cards | 2,482 px | Slow to scan | change to the ruled list | Starts a request in one tap |
| Work carousel (21 jobs) | 4,764 px, drag/tap JS | Long; JS for a gallery | move to /work/ as scrolling photo rows; one job on home | Keeps the proof, drops the cost |
| About + van | 2,494 px | Useful, but not needed to start a request | move to /about/; keep a 2-line "Meet Shane" | Same content, better place |
| Ten review cards | 4,231 px | Social proof matters | keep 2 on home, all 10 on /about/#reviews | Proof near the action, depth elsewhere |
| Social block, 7-question FAQ, full map | 611 + 1,194 + 1,855 px | Map/ checker is useful | social → footer; FAQ → 3 answers + service pages; map → /service-area/, compact checker on home | Moves detail to where people look for it |
| Floating "Call Shane" pill | Fixed bottom pill on home, service, hub and town pages | Covers content and keyboard controls | remove everywhere | Header call replaces it |
| Request form | 8 controls, 1,063 px; description always typed | Typed description every time | change | See Forms |
| Fraunces sub-line | Serif under the wordmark | Second display face for one line | remove | One display face |
- 2026-10-10 — status → client-review.
- 2026-10-10 — v1.0.1: Preload only the heading font (measured); inner pages normalised to token radius and no hover motion; LCP elements verified; independent-review fixes recorded in the implementation notes.
- 2026-10-10 — status → client-review.
- 2026-10-10 — **v1.1.0: hero options and ZIP-first coverage.** Portrait removed from the home page (owner dislikes it). Five review-only hero options built (above); the live home hero is copy only until Irving chooses. Motion candidate tier brief-once recorded for the chosen hero only. Lettering font role added (system Arial, option 4 only). Coverage checker changed from a town list to ZIP first with an approximate pin; the 14 confirmed towns are unchanged and are still the only "Yes"; a proposed expansion is kept separately in `src/service-area-proposed.json` and never answers Yes.
- 2026-10-10 — v1.1.0: Hero options (review only), ZIP-first coverage checker, portrait removed from home, lettering font role, motion candidate.
