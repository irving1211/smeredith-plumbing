# Hero concepts — S. Meredith Plumbing & Heating (existing client)

Method: the evidence → concept → build → before/after → QA steps of `if-they-hired-me`, adapted to an existing, contracted client. No outreach, no "unofficial concept" framing, nothing prepared for publication. Brief: vault `_context/claude-hero-coverage-prompt-2026-10-10.md`.

## Evidence studied

| Evidence | Where | What it gives the hero |
|---|---|---|
| Logo (owner-supplied) | `public/images/logo-full.png` (720 × 710, transparent, re-exported from a JPEG) | Charcoal #313131 and red #D32B2C; a house between two crossed pipe wrenches; a condensed wordmark between two rules; the phone number in the red base. Used whole and unchanged in every option |
| Van side (owner photo) | `public/images/van/van-side.jpg`, transcription `assets/refs/van-side-list.txt` | A bold italic bullet list (Remodels, Boilers, New Construction, Furnaces, General Plumbing, Water Heaters), the logo decal on white, "License #9630040" by the door |
| Brand line | live site, `design/VOICE.md` | "The plumber who answers the phone." Customers describe Shane by what he does (responded, arrived, explained) |
| Services Shane offers | `src/service-options.json` | Water heaters, boilers, gas, remodels, new construction, general, emergency |
| Owner preference | Irving, 2026-10-10 | Shane dislikes the current portrait: not used as a hero visual |

## Thesis

The one thing the business sells that a chain cannot is that **the person on the logo picks up**. Each option tells that in a different picture, with the same words and the same two actions, and none makes the customer wait.

## The five, and why each is different

1. **Phone → pipe → logo.** Cause and effect drawn as plumbing: the call runs through a pipe to Shane. Hierarchy: drawing first on phones (it is short), copy first on desktop.
2. **The logo picks up.** The logo itself answers. A dark band (the only dark hero) with the logo on a white plate, the way it sits on the white van.
3. **Plumbing diagram.** Problem-first: three real problems (leak, no hot water, no heat) pipe into one line that ends at the logo. Grid paper and riser-diagram drawing say "trade" without stock photos.
4. **Van lettering.** Identity-first: copy, then a panel that reads like the side of his van. The most literal brand recognition; Furnaces left off pending S5.
5. **A plumber answers.** People-first, the friendliest, but it introduces a new character that is not Shane: a proposed brand extension that needs his approval.

## Directions rejected

| Direction | Why not |
|---|---|
| Shane's portrait (any crop) | He dislikes it (brief) |
| A real job photo as the hero | Strong proof, but the brief asks for the five directions above; one job photo already sits lower on the page |
| Animated or redrawn logo (wrenches swinging, house lighting up) | The logo must not be modified; animating it is a modification |
| Continuous ringing, splash screen, logo reveal that hides content | Brief: plays once, never blocks; the logo underneath option 1's cover panel is painted at once |
| Lottie/GSAP animation | ~30-60 KB of library for a one-second effect that CSS does natively |
| Generated illustration or stock mascot | No paid generation without approval; stock mascots are the category rut |
| Map pin or van photo as the hero | The pin belongs to the coverage checker; the van photo is a landscape that crops badly at 390 px |

## Before and after

`before/` = the preview build before this work (commit `0aaa619`): portrait in the desktop hero. `final/` = the same pages and the five options after, phone 390 × 844 and desktop 1280 × 800, first screen and full page, captured after animations settle; `final-reduced/` = reduced motion (identical resting state).
