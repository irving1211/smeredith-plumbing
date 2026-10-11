# Frontend quality review — objective checks

- Target: http://127.0.0.1:56156/review/hero-2/
- Audited: 2026-10-11T02:25:17.442Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 0 · P3 2)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
| F002 | P3 | token-color | colours not in tokens.json: #0e131c (#top) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |
