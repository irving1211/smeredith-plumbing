# Frontend quality review — objective checks

- Target: dist
- Audited: 2026-10-10T22:59:51.334Z
- Breakpoints: 390, 768, 1280, 1920 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 0 · P3 0)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|

## Judgment (rubric J1-J13, walked 2026-10-10 against the final build at 390 and 1280 px; kind: judgment)

| # | Check | Result | Evidence |
|---|---|---|---|
| J1 | Brand consistency | PASS | Colours, type and spacing come from `design/tokens.json`; the inner pages' old 12-16 px cards, pill links and hover movement were normalised to the one 6 px radius and no motion. |
| J2 | 5-second test (390 px) | PASS | First screen: owner-operated by Shane Meredith (who), plumbing/heating/gas and additions (what), Saugus, the North Shore and Boston (where), Call and Request service (the one action), first service row visible. Test: `pages.e2e.mjs`. |
| J3 | Primary conversion path | PASS | Home row → form with the service chosen → one tap on what is going on → name, phone, town → Send → "Your request has been sent to Shane. He will review the details and call you back." No response time is promised because none is confirmed. |
| J4 | Visual hierarchy / silhouette | PASS | Left-aligned headline, two buttons, a long ruled list, short quotes, one photo, a dark band. Does not read as hero + three cards + band. |
| J5 | Same-category swap | PASS | The service list, headline, logo-sampled colours, wordmark-echo type and photos are Shane's; see DESIGN.md. |
| J6 | Typography | PASS | Barlow Condensed for headings, buttons and the wordmark; Inter for reading and forms; prose capped at 40rem. Inter body is a recorded decision, not a reflex. |
| J7 | Spacing rhythm | CONCERN (P3) | New pages use the token scale. The service and town pages are unchanged in structure and are still long (about 8,800 px on a phone); shortening them is a separate task. |
| J8 | Trust and proof | CONCERN (P2) | The new pages use only confirmed proof. **The older service pages, service hub and town pages still carry claims with no source in the client records** ("same-day swaps", "even Saturdays", "free written quotes", "fully insured", "stocked truck", 1-hour callback). Not edited here because changing business claims is Shane's call; listed as S6 in `owner-actions-2026-10-10.md`. Recommend answering S6 before this goes to production. |
| J9 | Copy | PASS | Voice-adapted; CTA labels exact (Call 781-820-4592, Request service, Send request); none of the banned words on new pages (tested for the home page). |
| J10 | Imagery | PASS | Real photos only, GPS stripped (tested); portrait crops at 390 px; every job photo has alt text and loads (tested). |
| J11 | Forms usability | CONCERN (P3) | Types, autocomplete and errors are right and tested; the form is 1,318-1,743 px long on a phone (it was 1,063 px) because it offers choices. The saving is typed fields, not scrolling; see `form-field-map-2026-10-10.md` for what to cut first if it feels long. |
| J12 | Local SEO | PASS | Title and description name Saugus; NAP and license in header/footer/schema; a Service area page with the checker and map; town pages kept and linked; sitemap and canonicals tested. The home h1 is the owner's own line and does not contain the town (the title and first paragraph do). |
| J13 | Anti-slop | PASS | No centered hero, check-mark bullets, stat strip, card grid on the home page, carousel, reveal animation, sticky bar or accent word. All-caps is limited to headings and buttons and comes from the logo wordmark. |

Not checked: a screen reader (NVDA/VoiceOver) on the revealed questions; a real phone's autofill; the production site (nothing deployed). Verdict stays **SHIP** for the preview; J8 (P2) should be resolved with Shane before production.
