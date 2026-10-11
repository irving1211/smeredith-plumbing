# Frontend quality review — objective checks

- Target: http://127.0.0.1:56156/review/hero-3/
- Audited: 2026-10-11T02:25:22.811Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 0 · P3 2)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
| F002 | P3 | token-color | colours not in tokens.json: #1b1b1b (#top), #111111 (div.hm-photo) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |

## Contrast to check visually (text over images or translucent layers — not measurable)

- #hero-h: "The plumber who answers the phone." (#ffffff)
- p.lede: "Owner-operated by Shane Meredith. Plumbing, heatin" (#ffffff)
- a.btn.btn-ghost-dark: "Request service" (#ffffff)
- p.hero-alt: "Prefer to text?" (#ffffff)
- a: "Text photos to Shane" (#ffffff)
- span: "MA master plumber · Lic. 9630040-PL-M" (#ffffff)
- span: "Owner-operated" (#ffffff)
- span: "24/7 emergency service" (#ffffff)
- strong: "S. Meredith Plumbing & Heating" (#ffffff)
- span: "Boiler, tank and zone manifold · a finished job" (#ffffff)
