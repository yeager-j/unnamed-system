# Dungeon Console — Code-Quality Survey & Refactor Plan

**Scope:** `apps/web/components/dungeon/**` (DM run-console + signed-out fog watch; ~37 files / 4.9k LOC, shipped across UNN-462→489).
**Date:** 2026-06-20 · **Focus:** React best practices + organization · **Outcome:** maintainability-only (no correctness defects found).

## How this was produced

A multi-agent review (8 lenses → adversarial verify → synthesize) over the feature, followed by a
targeted Opus re-scan for single-responsibility that **counts private/inline sub-components**, after the
first pass under-called inlined chips.

- **Lens pass precision:** 14 findings raised → **11 confirmed, 3 dropped** as React-Compiler / React-Flow
  false positives, 0 added by the completeness critic.
- **Re-scan added 3** granularity findings the lens pass missed (it judged a file by its *exported*
  component only and waved through inlined sub-components).

Every confirmed finding was spot-checked against source. There are **no correctness bugs** — all items are
coupling, granularity, duplication, or React-runtime hygiene.

**Explicitly out of scope:** error boundaries around the React Flow subtree (the owner is aware none exist
and will address separately). Do not add them in this work.

---

## Findings

### Cross-feature coupling
`components/` should be siloed per feature; these three primitives are generic but physically owned by
`components/combat/` and reached for by dungeon.

- **`VitalBar`** — a 39-line, domain-agnostic HP/SP progressbar owned by `combat/`, imported by 3 dungeon
  files. [`canvas/dungeon-token-chip.tsx:6`](../../apps/web/components/dungeon/canvas/dungeon-token-chip.tsx#L6)
- **`EnchantmentBadge`** — its own docstring says it serves both the encounter ZoneLayout and the dungeon
  combat zone card, yet it's siloed in `combat/`. (Move only the **read-only badge**; the
  `ZoneEnchantmentControl` write control stays in combat.)
  [`canvas/dungeon-combat-zone-node.tsx:15`](../../apps/web/components/dungeon/canvas/dungeon-combat-zone-node.tsx#L15)
- **`CampaignBackLink`** — a 25-line campaign-nav Link with no combat coupling, used by dungeon prep + watch.
  [`dungeon-prep.tsx:18`](../../apps/web/components/dungeon/dungeon-prep.tsx#L18)

### Granularity & single-responsibility
The dominant theme: **presentational chips/rows inlined against the codebase's one-component-per-file
convention.** There are four zone-node files; two delegate token rendering to dedicated chip files
(`dungeon-zone-node` → `DungeonTokenChip`, `dungeon-combat-zone-node` → `DungeonCombatTokenChip`), and
**two inline their chips**.

- **`dungeon-fog-zone-node.tsx`** (238 LOC, largest node file) defines the node **plus** two standalone
  components inline: `FogEnemyChip` (~24 lines) and `ExitChip` (~12 lines).
  [`canvas/dungeon-fog-zone-node.tsx:197-238`](../../apps/web/components/dungeon/canvas/dungeon-fog-zone-node.tsx#L197)
- **`dungeon-setup-zone-node.tsx`** — the twin: inlines a ~32-line PC inclusion `<button>` and a ~10-line
  staged-enemy `<span>`; the lone setup node that doesn't extract. The PC chip is a near-dup of
  `DungeonCombatTokenChip`'s players branch.
  [`canvas/dungeon-setup-zone-node.tsx:59-107`](../../apps/web/components/dungeon/canvas/dungeon-setup-zone-node.tsx#L59)
- **`dungeon-zone-sheet.tsx`** (445 LOC) — `ExitRow` is a ~98-line standalone presentational row (neighbor
  name + status line + a 4-callback reveal/hide/unlock/re-lock cluster), the file's second job on top of the
  sheet's confirm-flow orchestration. First cut at splitting this file.
  [`dungeon-zone-sheet.tsx:348-445`](../../apps/web/components/dungeon/dungeon-zone-sheet.tsx#L348)
- **`dungeon-encounter-setup.tsx`** — inlines two non-trivial pure shapers (`CombatantSetup[]` builder +
  `tokensByZone` board builder) that CLAUDE.md says belong as pure helpers next to the data.
  [`dungeon-encounter-setup.tsx:113-164`](../../apps/web/components/dungeon/dungeon-encounter-setup.tsx#L113)
- **`dungeon-canvas.tsx`** (soft) — five pure node/edge shapers co-located with the component
  (`dungeon-fog-canvas.tsx` repeats the pattern). **Caveat:** these emit `@xyflow/react` node shapes, so they
  must **not** move into the pure engine — the right home is a co-located UI helper, not
  `packages/game/src/engine/dungeon/`.
  [`canvas/dungeon-canvas.tsx:83-192`](../../apps/web/components/dungeon/canvas/dungeon-canvas.tsx#L83)

### React runtime
- **Manual `useMemo` on `canvasMode` contradicts the two sibling phase bodies** that deliberately rely on the
  React Compiler (`reactCompiler:true`) for the identical stability concern feeding the shared `DungeonCanvas`
  node-sync effect. The siblings' compiler assumptions were verified to hold — Setup is the outlier. The
  upstream `partyCandidates`/`zones`/`setups`/`tokensByZone` memos are likewise redundant.
  [`dungeon-encounter-setup.tsx:166-169`](../../apps/web/components/dungeon/dungeon-encounter-setup.tsx#L166)
- **Reminder-toast effect depends on the whole `dungeonState` but only reacts to `turnCounter`.**
  `dungeonState` is `useOptimistic`, so its identity churns on every dispatch/refresh, re-running the effect
  needlessly (only a ref-guard prevents a spurious toast). Narrowing to `[dungeonState.turnCounter]` was
  considered but **not done** — the effect body reads the whole `dungeonState` via `dungeonReminders(...)`, so
  `react-hooks/exhaustive-deps` (warn) would flag it; the ref-guard already makes the extra runs a cheap
  early-return, so the narrowing isn't worth a lint warning/suppression. Left as-is.
  [`dungeon-explore-body.tsx:98-109`](../../apps/web/components/dungeon/dungeon-explore-body.tsx#L98)

### Polish (duplication sweep)
- **Chip side-tints** (PC-blue / enemy-red wrappers + initials tints) across the token chips. **Deferred** — on
  closer reading the tints genuinely vary per chip (`DungeonTokenChip` uses `primary` tokens for its glyph + an
  `owned`→yellow override; the setup enemy is a dashed "ghost", not the solid red), so only the glyph string is
  truly verbatim. A shared palette would be a premature abstraction splitting each chip's visual definition
  across files for marginal gain; left inline.
  [`canvas/dungeon-token-chip.tsx:40-44`](../../apps/web/components/dungeon/canvas/dungeon-token-chip.tsx#L40)
- **Bottom-Panel toolbar shell** (`flex items-center gap-1 rounded-none border bg-popover p-3 shadow-lg`)
  duplicated verbatim across `turn-loop-bar`, `combat-turn-bar`, `setup-bar` — and even
  `maps/canvas/canvas-toolbar.tsx:40`. [`canvas/turn-loop-bar.tsx:49-51`](../../apps/web/components/dungeon/canvas/turn-loop-bar.tsx#L49)
- **Empty-board Panel notice** duplicated across the two canvases.
  [`canvas/dungeon-canvas.tsx:275-278`](../../apps/web/components/dungeon/canvas/dungeon-canvas.tsx#L275)
- **Sidebar header** (back-link + truncating delve-name h1) duplicated across all 3 phase sidebars.
  [`dungeon-party-sidebar.tsx:86-100`](../../apps/web/components/dungeon/dungeon-party-sidebar.tsx#L86)
- **Enemy-catalog dialog shell** duplicated verbatim between the two enemy dialogs.
  [`dungeon-add-combatant-dialog.tsx:68-69`](../../apps/web/components/dungeon/dungeon-add-combatant-dialog.tsx#L68)

---

## Refactor plan — one PR, reviewable by commit

Each commit is self-contained and behavior-preserving (pure refactors). Ordering respects the two real
dependencies noted below. Verify each commit with `npm run typecheck && npm run lint`; run the dev server and
eyeball the three canvases (play / setup / combat) + the fog watch after the chip/chrome commits, since those
move rendered markup.

| # | Commit | Findings | Touches |
|---|--------|----------|---------|
| 1 | `refactor(shared): relocate VitalBar, EnchantmentBadge, CampaignBackLink to components/shared` | Coupling ×3 | `components/{combat,shared,dungeon}` import updates |
| 2 | `refactor(dungeon): extract inlined zone-node chips (one-chip-per-file)` | fog + setup nodes | `canvas/dungeon-fog-zone-node`, `canvas/dungeon-setup-zone-node`, new chip files |
| 3 | `refactor(dungeon): extract ExitRow from dungeon-zone-sheet` | zone-sheet | `dungeon-zone-sheet.tsx`, new `dungeon-exit-row.tsx` |
| 4 | `refactor(dungeon): extract setup board shapers` | encounter-setup shapers | `dungeon-encounter-setup.tsx`, new `setup-board.ts` |
| 5 | `refactor(dungeon): extract React Flow node/edge builders` | canvas shapers | `canvas/dungeon-canvas`, `canvas/dungeon-fog-canvas`, new `canvas/build-dungeon-nodes.ts` |
| 6 | `refactor(dungeon): drop redundant useMemos, align canvasMode with the compiler convention` | React runtime | `dungeon-encounter-setup.tsx` |
| 7 | `refactor(dungeon): extract shared canvas chrome + sidebar/dialog shells` (orig. 8 + 9, one commit) | Polish: bar, notice, header, dialog | new `shared/canvas/{canvas-bottom-bar,canvas-empty-notice}` + `dungeon/{dungeon-sidebar-header,enemy-catalog-dialog}`; 4 bars, 2 canvases, 3 sidebars, 2 dialogs |
| — | SIDE_TINT chip-tint dedup — **deferred** (tints vary per chip; see finding) | Polish: tints | — |

### Commit detail

**1 — Relocate shared primitives.** Move `vital-bar.tsx`, `enchantment-badge.tsx` (read-only badge only —
leave `zone-enchantment-control.tsx` in combat), and `campaign-back-link.tsx` from `components/combat/` to
`components/shared/`; update all importers in combat + dungeon. Mechanical; review is "imports resolve,
typecheck green." Do this **first** so later commits import the chips/badges from their final home.

**2 — Extract inlined zone-node chips.** New `canvas/fog-enemy-chip.tsx` (`FogEnemyChip`),
`canvas/exit-chip.tsx` (`ExitChip`), and `canvas/dungeon-setup-token-chip.tsx` (PC + staged-enemy chips).
The fog and setup zone nodes map tokens to these like their two siblings already do. After this, all four
zone-node files do one job: compose the Zone card. No behavior change — copy markup verbatim.

**3 — Extract `ExitRow`.** New `dungeon-exit-row.tsx` taking the `ZoneExit`-shaped props + the four
reveal/hide/unlock/re-lock callbacks. `ZoneSheetBody` keeps the confirm-flow state machine and maps exits to
`<ExitRow>`. Leave the trivial `Field` helper inline. This is the first cut at the 445-LOC split; the rest of
that file (description / notes / search-reveal picker) can follow in a later ticket if desired.

**4 — Extract setup board shapers.** New `dungeon-encounter-setup`-adjacent `setup-board.ts` exporting
`buildSetupCombatants(includedIds, enemies, occupancy)` and `buildSetupTokensByZone(partyCandidates, enemies,
includedIds, occupancy)` as pure functions; the component's `useMemo`s call them. (App-coupled types keep this
UI-side rather than in the engine.)

**5 — Extract canvas node/edge builders.** New `canvas/build-dungeon-nodes.ts` with the `buildNodes`/
`buildEdges` family, imported by both `dungeon-canvas.tsx` and `dungeon-fog-canvas.tsx`. **Stays UI-side** — these
emit React Flow node shapes and must not pull `@xyflow/react` into the pure engine. Soft/optional; include it if
you want the canvas shells to be just the controlled-flow + viewport wiring.

**6 — React-runtime hygiene.** Drop the five redundant `useMemo`s in `dungeon-encounter-setup.tsx`
(`partyCandidates`/`zones`/`setups`/`tokensByZone`/`canvasMode`) — `reactCompiler:true` already memoizes them;
`canvasMode` becomes a plain literal with the parity "compiler keeps this stable" comment its siblings carry.
The reminder-effect dep narrowing was dropped (see the finding above — it would add an `exhaustive-deps`
warning for negligible gain). **Depends on commit 4** (the shapers are extracted first, so this commit only
removes the now-thin memo wrappers).

**7 — Shared canvas chrome + sidebar/dialog shells (orig. commits 8 + 9, combined).** Extract `CanvasBottomBar`
(Panel + TooltipProvider + toolbar container, with `className` for setup-bar's `flex-wrap`) and
`CanvasEmptyNotice` into `components/shared/canvas/`, folding `maps/canvas/canvas-toolbar.tsx` into the same bar
(establishes the shared-canvas **chrome** module beside the existing floating-edge geometry). Extract
`DungeonSidebarHeader` (back-link + delve-name h1 + `trailing` Round-badge slot + `children` subtitle) used by
the 3 phase sidebars, and an `EnemyCatalogDialog` shell (sized `DialogContent` + bordered header +
`EnemyCatalogPanel` wiring; the caller owns the queue + commit) used by the 2 enemy dialogs.

**SIDE_TINT (orig. commit 7) — deferred.** The chip tints genuinely vary per chip (see the finding above), so a
shared palette would be premature abstraction; the tints stay inline.

### Dependencies at a glance
- **6 after 4** (memo-drop after the shaper extraction in the same file).
- **1 first** (everything else imports the relocated primitives from their final path).
- All others are independent and can land in any order.
