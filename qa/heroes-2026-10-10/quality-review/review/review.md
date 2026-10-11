# Frontend quality review — objective checks

- Target: http://127.0.0.1:52673/review/
- Audited: 2026-10-11T00:37:16.885Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: SHIP** (P0 0 · P1 0 · P2 1 · P3 1)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P2 | focus-visible @1280 | no visible focus indicator on: iframe | Keyboard users cannot see where they are (WCAG 2.4.7). | Add a visible :focus-visible style (outline ≥2 px). | Re-run: node scripts/audit.js <target> — the focus-visible finding must be gone. |
| F002 | P3 | canonical | no canonical link | Duplicate URLs can split ranking signals. | Add <link rel="canonical">. | Re-run: node scripts/audit.js <target> — the canonical finding must be gone. |
