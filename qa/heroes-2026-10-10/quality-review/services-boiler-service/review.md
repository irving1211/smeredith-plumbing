# Frontend quality review — objective checks

- Target: http://127.0.0.1:50073/services/boiler-service/
- Audited: 2026-10-11T03:49:42.765Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 2 · P3 0)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P2 | lcp-lazy @1280 | LCP element <IMG> http://127.0.0.1:50073/images/jobs/boiler-manifold-room/shot-1-480.webp is loading="lazy" | Lazy-loading the hero image delays the largest paint (Core Web Vitals). | Remove loading="lazy" from the hero/LCP image; consider fetchpriority="high". | Re-run: node scripts/audit.js <target> — the lcp-lazy finding must be gone. |
| F002 | P2 | jsonld-missing-field | Service missing telephone, address | Incomplete LocalBusiness data weakens local search signals. | Add name, telephone and address to the LocalBusiness block. | Re-run: node scripts/audit.js <target> — the jsonld-missing-field finding must be gone. |
