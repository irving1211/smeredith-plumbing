# Frontend quality review — objective checks

- Target: http://127.0.0.1:61599/review/hero-2/
- Audited: 2026-10-11T00:36:20.764Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 1 · P3 1)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P2 | lcp-lazy @1280 | LCP element <IMG> http://127.0.0.1:61599/images/jobs/single-water-heater-open-basement/shot-1-900.webp is loading="lazy" | Lazy-loading the hero image delays the largest paint (Core Web Vitals). | Remove loading="lazy" from the hero/LCP image; consider fetchpriority="high". | Re-run: node scripts/audit.js <target> — the lcp-lazy finding must be gone. |
| F002 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
