# Frontend quality review — objective checks

- Target: http://127.0.0.1:56156/review/hero-1/
- Audited: 2026-10-11T02:25:12.024Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 1 · P3 2)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P2 | lcp-lazy @1280 | LCP element <IMG> http://127.0.0.1:56156/images/jobs/single-water-heater-open-basement/shot-1-900.webp is loading="lazy" | Lazy-loading the hero image delays the largest paint (Core Web Vitals). | Remove loading="lazy" from the hero/LCP image; consider fetchpriority="high". | Re-run: node scripts/audit.js <target> — the lcp-lazy finding must be gone. |
| F002 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
| F003 | P3 | token-color | colours not in tokens.json: #141414 (#top), #222222 (div.hc-screen), #e5484d (span.hc-key.hc-decline), #2dbe60 (span.hc-key.hc-answer), #9be7b4 (p.hc-on) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |

## Contrast to check visually (text over images or translucent layers — not measurable)

- #hero-h: "The plumber who answers the phone." (#ffffff)
- p.lede: "Owner-operated by Shane Meredith. Plumbing, heatin" (#ffffff)
- a.btn.btn-ghost-dark: "Request service" (#ffffff)
- p.hero-alt: "Prefer to text?" (#ffffff)
- a: "Text photos to Shane" (#ffffff)
- span: "MA master plumber · Lic. 9630040-PL-M" (#ffffff)
- span: "Owner-operated" (#ffffff)
- span: "24/7 emergency service" (#ffffff)
