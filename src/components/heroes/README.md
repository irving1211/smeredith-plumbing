# Home hero options

Home hero. `baseline` is the hero on the live preview today (copy only; the portrait Shane dislikes is gone).
Options 1-5 are review candidates for Irving and Shane (built under /review/ only when PUBLIC_REVIEW_ROUTES=1).
Every option shares HeroCopy (same words, same Call and Request actions) and Shane's unchanged logo.

Motion rules (design/DESIGN.md "Motion", tier "brief-once"):
 - CSS only, no script and no library. Plays once on load, finishes within 1.4 s, never loops.
 - The resting state IS the normal CSS; animations only describe how it is reached. With reduced motion (or if
   animations never run) the complete static hero shows immediately.
 - Only decorative drawings move. The heading, text, buttons and the logo image itself never move or fade, so
   nothing waits on an animation and the largest paint is not delayed. (Option 1 uncovers the logo with a panel
   on top of it; the logo underneath is painted at once.)
 - Drawings are aria-hidden; reserved aspect ratios prevent layout shift.

Files: `HeroBaseline` (the live preview hero), `HeroPipe` (1), `HeroPickup` (2), `HeroDiagram` (3), `HeroVan` (4), `HeroPlumber` (5). Shared: `../HeroCopy.astro` (words and actions), `../LogoPicture.astro` (the unchanged logo). Each page imports only the hero it shows, so it carries only that hero's CSS.
