# Frontend quality review — objective checks

- Target: http://127.0.0.1:50073/
- Audited: 2026-10-11T03:49:18.288Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 0 · P3 1)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P3 | token-color | colours not in tokens.json: #222222 (div.hc-screen), #e5484d (span.hc-key.hc-decline), #9be7b4 (p.hc-on) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |

## Contrast to check visually (text over images or translucent layers — not measurable)

- #hero-h: "The plumber who answers the phone." (#ffffff)
- p.lede: "Owner-operated by Shane Meredith. Plumbing, heatin" (#ffffff)
- a.btn.btn-ghost-dark: "Request service" (#ffffff)
- p.hero-alt: "Prefer to text?" (#ffffff)
- a: "Text photos to Shane" (#ffffff)
- span: "MA master plumber · Lic. 9630040-PL-M" (#ffffff)
- span: "Owner-operated" (#ffffff)
- span: "24/7 emergency service" (#ffffff)
