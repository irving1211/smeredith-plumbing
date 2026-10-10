---
schema_version: 1
client: S. Meredith Plumbing & Heating
copy_authority: voice-adapted
last_updated: 2026-10-10
---

# Voice — S. Meredith Plumbing & Heating

## Copy authority

`voice-adapted`: the redesign reorganizes and shortens wording that is already live on the site or already confirmed by the owner, and adds **no new claims**. Interface text (form labels, button labels, navigation, helper text, error messages) is functional copy, not marketing, and is written to the rules below. Approval gate: Irving reviews the preview; Shane reviews any wording that makes a business claim before the redesign goes to production. Where a live claim has no source in the client records it is **not carried onto the redesigned homepage** and is listed for Shane in `_context/` (it stays on the not-yet-redesigned inner pages until he answers; see the claims table below).

## Voice evidence

The records do not contain Shane's own captions, texts or emails, only text written about him or for him. That is an evidence gap, listed as an owner input. What exists:

1. Van lettering, in his own words and order: "Remodels · Boilers · New Construction · Furnaces · General Plumbing · Water Heaters" (`public/images/van/van-side.jpg`). Plain nouns, no adjectives.
2. Customer review, verbatim: "Shane said 'I can fix it,' and he did." (Daniel M., furnace repair; `src/pages/index.astro` review list, from the owner's screenshots in `_context/harvest/2026-05-28-owner-photo-drop/`.)
3. Customer review, verbatim: "He was so understanding of my situation with four kids at home and got our hot water back as soon as possible." (Carly C., water heater replacement.)
4. Customer review, verbatim: "Quickly diagnosed and resolved the problem, explained it in plain terms, and his pricing was very reasonable." (Luke B.)
5. Existing live line attributed to Shane on the site: "if you can't get me on the first ring, I'll call you back." (About section; origin to be reconfirmed by Shane.)

What the samples share: first-person-singular, concrete, short, no hype. Customers describe him with verbs (responded, fixed, explained, arrived), not adjectives.

## Tone rules

- Open with what happens for the customer ("Shane answers", "Send the details"), not with what the business is.
- Sentences under 20 words. One idea per sentence. Numbers as digits.
- Name the work in the words on the van: water heaters, boilers, remodels, new construction, general plumbing.
- No exclamation marks, no urgency invented for effect. Emergency wording only where Shane's confirmed "24/7 emergency services" applies.
- Never imply availability or a response time Shane has not confirmed.

## Vocabulary

- Use: Shane, owner, request service, call, text, water heater, boiler, remodel, new construction, gas line, general plumbing, town, estimate (as "request an estimate" only; "free" and "written" only after Shane confirms)
- Avoid: dispatch, solutions, premium, craftsman-as-slogan, "state-of-the-art", "peace of mind", emergency-as-decoration

## Banned words

seamless, robust, elevate, leverage, unlock, cutting-edge, game-changer, world-class, transform, synergy, "in today's", "let's dive in", passionate about, AI-powered, plus: premium, solutions, best-in-class, top-rated (no rating is verified), guarantee, warranty (Shane handles these job by job), "licensed and insured" (insurance is unverified; use the license number only), "same-day" (unconfirmed), "free estimates" (unconfirmed), "1-hour callback" (unconfirmed)

## Approved claims

| Claim | Proof / source |
|---|---|
| Owner-operated by Shane Meredith | `_context/scope.md` owner-confirmed inputs (2026-05-28); GBP |
| MA master plumber license 9630040-PL-M | Owner-provided; state public record Active, checked 2026-10-06 (`_context/gbp-reconciliation-sheet.md`) |
| Phone 781-820-4592; public email shane@smeredithplumbing.com | `_context/scope.md` |
| 24/7 emergency services | Owner-confirmed hours wording (`_context/scope.md`) |
| Saugus, MA base; service area = the 14-town list in `src/service-area.json` | Owner boundary map approved 2026-05-28 |
| Services: water heaters, boilers, kitchen and bath remodel plumbing, new construction, general plumbing, gas lines (gas pages keep their wording pending gas-fitter confirmation) | Van lettering; `_context/scope.md` services list |
| Customer review excerpts, first name + last initial | Owner's Google review screenshots, verbatim |

**Live claims with no source, not used on the redesigned homepage:** "fully insured" / "licensed & insured" (carrier unverified), "same-day boilers / Saturdays", "free written quotes / estimates", "1-hour callback", "no dispatch fees", "stocked van / parts on the truck", "commercial jobsites", "check, Venmo & cash accepted" (Shane prefers not to publish payment methods), "10+ years" (kept only in the About page text that already exists), "5-star Google reviews" as a rating claim (the page links to the reviews instead). Each is on the owner-input list.

## CTA labels

- Primary: **Call 781-820-4592** (header, hero, footer)
- Primary form: **Request service** (header, hero, service lists); the form's submit button: **Send request**
- Secondary: **Text Shane** / **Text photos** (sms link, existing)
- Service rows: the service name as the link text; the destination carries the service into the form
- Coverage: **Check your town**
