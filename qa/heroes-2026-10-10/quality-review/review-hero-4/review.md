# Frontend quality review — objective checks

- Target: http://127.0.0.1:56156/review/hero-4/
- Audited: 2026-10-11T02:25:28.207Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 0 · P3 2)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
| F002 | P3 | token-color | colours not in tokens.json: #222222 (div.hr-frame.is-live), #101010 (input.hr-range) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |

## Contrast to check visually (text over images or translucent layers — not measurable)

- #hero-h: "The plumber who answers the phone." (#313131)
- p.lede: "Owner-operated by Shane Meredith. Plumbing, heatin" (#595959)
- p.hero-alt: "Prefer to text?" (#595959)
- a: "Text photos to Shane" (#313131)
- span: "MA master plumber · Lic. 9630040-PL-M" (#595959)
- span: "Owner-operated" (#595959)
- span: "24/7 emergency service" (#595959)
- figcaption: "One of Shane's kitchen and bath jobs, from the rou" (#595959)
