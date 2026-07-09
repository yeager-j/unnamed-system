# 2026-07-09 — The component reused fine, until it was given less room

**Symptom:** a component composed cleanly on its own page, then rendered
overflowing the moment it was mounted in a narrow container — and nothing in
its props or types said it couldn't go there. The breakage read as a CSS bug;
it was a seam placed one level too high.

**Context:** UNN-566, rebuilding both watch own-sheet columns. `CombatTab` was
mounted in a 340px rail: its own `px-5` nested inside the rail's padding and
pushed an `minmax(18rem,1fr)` grid into horizontal overflow. Fixed that, then
hit the identical shape again in `ExploreTab`, whose `lg:grid-cols-[3fr_2fr]`
keys off the **viewport** and so laid two tracks inside the column. Both were
invisible to `tsc` and to the test suite — only the browser showed them. (v1's
deleted column had a comment saying it deliberately didn't reuse `ExploreTab`;
the reason had been rediscovered, not read.)

**Position:**

```tsx
// The tab root — reusable-looking, but it encodes its container:
<div className="px-5 py-4">                       {/* "I own the page's gutter" */}
  <div className="grid lg:grid-cols-[3fr_2fr]">   {/* "I am viewport-wide"      */}
```

The fix is a seam one level lower: extract the **body** (`SkillCastSection`),
and let each container supply its own chrome.

**Principle:** a tab root does two jobs — page chrome and content — so it is
not the reuse unit (→ Code Style #2, one job per component). The chrome half
encodes a decision the component doesn't own: how much room it has. A `lg:`
breakpoint is a claim about the *viewport*, so any component carrying one has
silently declared itself viewport-wide (Parnas 1972: a module hides one
decision; here the hidden decision belongs to the caller). CSS container
queries exist precisely to let a component ask its container instead — until
then, extract the body.

**Action:** `SkillCastSection` + `AdjustPoolControl` extracted (two real
consumers each); `combat/AGENTS.md` records "watch columns compose sheet
components, never a tab root." Candidate follow-up: move the card grids to
`@container` queries so tab roots become width-agnostic and reusable.
