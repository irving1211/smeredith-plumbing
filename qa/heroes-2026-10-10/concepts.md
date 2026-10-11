# Hero concepts — S. Meredith Plumbing & Heating (existing client)

Method: the evidence → concept → build → before/after → QA steps of `if-they-hired-me`, adapted to an existing, contracted client. No outreach, no "unofficial concept" framing, nothing prepared for publication.

## Round 2 (2026-10-10, night) — after Irving's review

Irving on round 1: "very low quality and not at all what we've been doing with what if they hire me … unique heroes that push the limits … look at the catalog … if you have to keep Shane's image just make the hero more high quality and easier to convert."

**What the catalog showed** (`C:/Users/Irving/projects/if-they-hired-me`: Paci Plumbing, AlexProductions, Mendez Flowers): real work photos visible from the first frame; poster-scale headline type; one signature system per business that turns their own trade into the picture (Paci's water heater feeding a copper header to four real jobs, Alex's viewfinder with real EXIF); rich dark surfaces with one brand accent; motion that rewards and never gates (Paci lesson 1). Round 1 ignored all of that: small clip-art drawings, no photos, no proof.

**Round 2 rule:** every option is built on Shane's own material (his job photos, his van, his reviews, his portrait, his logo), with one signature system each, a poster headline, and a conversion block that is bigger and fuller than before: Call (54 px), Request service, "Text photos to Shane", and a trust line of owner-confirmed facts only (MA master plumber license 9630040-PL-M, owner-operated, 24/7 emergency service).

| # | Option | Signature system | Evidence |
|---|---|---|---|
| 1 | Incoming call | A phone rings, Shane picks up, three customers' words arrive as texts. On phones the first thing is a call banner that is itself the call link | Brand line; verbatim excerpts from `src/reviews.json` (Daniel M., Carly C., Luke B.); logo |
| 2 | Blue hour | Full-bleed van photo at dusk, headline on the dark sky, one pass of evening light | `van-side.jpg` (owner photo): lettering, decal, number |
| 3 | Mechanical room | A finished job as a marked-up drawing: scan line, three callouts, title block with the logo | `jobs/boiler-manifold-room/shot-1.jpg` (job "Boiler Manifold Mechanical Room") |
| 4 | Rough to finished | The same job's rough stage and finished kitchen in one frame; the divider sweeps once, then the visitor drags it (real range control) | `jobs/kitchen-bath-remodel/shot-3.jpg` + `shot-2.jpg` (same job per `src/jobs.json`) |
| 5 | Owner poster | Shane's portrait as a red-and-charcoal print, logo badge, split-flap board flipping through his 14 confirmed towns to 24/7 | `shane.jpg` (supplied by Shane; he dislikes it, kept only because Irving allowed it), `src/service-area.json` |

All photos are crops of Shane's originals (`scripts/make-hero-photos.mjs`): no retouching, no generated or stock imagery, GPS dropped. Callout labels name only what the photo visibly shows.

### Rejected in round 2
| Direction | Why not |
|---|---|
| Animated or redrawn logo | Logo must stay unchanged |
| A live "call timer" or fake availability ("Shane is free now") | Would imply availability nobody has confirmed |
| Review stars / rating count in the hero | Self-serving review markup is not eligible and counts go stale; reviews appear as attributed words instead |
| Paid effect libraries (HorizonX components, Aceternity Pro) | Paid licence; not authorised. Everything is vanilla CSS plus a few lines of JS for the drag control |
| Video background | Heavy on phones, and there is no owner video |

## Round 1 (2026-10-10, evening) — rejected by Irving

Five code-drawn compositions (phone → pipe → logo; logo picks up; plumbing diagram; van lettering panel; illustrated plumber). Rejected as low quality: no photos, small decorative drawings, nothing that matched the catalog's standard. Screens kept in `draft/` and `final/` for the record.

## Before and after

`before/` = the preview build before this work (commit `0aaa619`). Round 2 screens: `v2-final/` (phone 390 × 844 and desktop 1280 × 800, first screen + full page, settled), `v2-final-reduced/` (reduced motion), `v2-widths/` (900–1920 px checks).
