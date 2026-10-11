# Frontend quality review — objective checks

- Target: http://127.0.0.1:50073/contact/
- Audited: 2026-10-11T03:49:31.160Z
- Breakpoints: 390, 768, 1280 px (screenshots in `screens/`)
- **Verdict: FIX-FIRST** (P0 0 · P1 1 · P2 1 · P3 1)

> Measured facts only. Design judgment (brand fit, hierarchy, CTA path, trust, anti-slop) is added separately from `references/rubric.md` and labelled `judgment`.

| ID | Sev | Check | Evidence | Business impact | Fix | Verify |
|---|---|---|---|---|---|---|
| F001 | P1 | tap-target @390 | input is 177×21px (need ≥44×44; WCAG minimum 24×24) | Small controls cause mis-taps on phones; WCAG 2.5.8 failure. | Give the control ≥44×44 px (min 24×24) via padding/min-height. | Re-run: node scripts/audit.js <target> — the tap-target finding must be gone. |
| F002 | P2 | tap-target @390 | input is 26×26px (need ≥44×44; WCAG minimum 24×24) (×12) | Small controls cause mis-taps on phones; WCAG 2.5.8 failure. | Give the control ≥44×44 px (min 24×24) via padding/min-height. | Re-run: node scripts/audit.js <target> — the tap-target finding must be gone. |
| F003 | P3 | token-color | colours not in tokens.json: #767676 (input) | Colours outside the approved design system — brand drift. | Replace with the nearest design-token colour or add the colour to tokens.json with a source. | Re-run: node scripts/audit.js <target> — the token-color finding must be gone. |
