# Handoff: Characters v2 ADR (fresh session kickoff)

**Mission:** Author the ADR + decision log for **Characters v2** — re-conceiving the character domain (storage, write path, read model, and the sheet/builder surfaces) on the engine-v2 capability thesis, the way combat was (docs/engine-v2/combat/) and spatial was (docs/engine-v2/spatial/). This folder (`docs/engine-v2/characters/`) is the ADR's home.

**Prime directive from Jackson:** the engine-v2 goals get realized **uncompromised**. UI receives a read/write factory; surfaces render capability read-units; the "what kind of thing is this" distinction is decided once. Explicit anti-goals:

- **No shadow engine.** No accretion of game logic in `apps/web/lib/` — projection and joining only, never derivation, and no adapter layer that becomes permanent.
- **No lingua-franca god-DTO.** `HydratedCharacter` does not get a successor. Per-surface view models compose from `ResolvedEntity` read-units; a shared slice exists only when two surfaces genuinely render the same one (precedent: the combat kit's `detail-view` vs `roster-view`).
- **No preserved v1 contracts.** The migration failure mode to avoid (learned from PR11a): flipping what *computes* a value while keeping the old contract enshrines the old worldview and bills an adapter at every boundary.
- **One write architecture.** Character writes join the registry-driven write-router pattern (CD18–CD20), generalized to durable entity writes — not a port of v1's `reduceCharacter`.

## How we got here (context the fresh session lacks)

1. Engine v2 (`packages/game-v2`) is done and load-bearing: all combat runs on it (UNN-520/530/535/536), sheet *values* are v2-computed via a bridge (UNN-533), the v2 spatial engine is built + golden-mastered (the spatial ADR header saying "build not started" is **stale** — trust code).
2. A full cutover audit (2026-07-03) produced a 10-PR port-in-place roadmap (UNN-543..549 + 539/540/538; roadmap + concern-resolution addendum live as **comments on UNN-510**). Five follow-up investigations verified the risky parts; their distilled findings are baked into the ticket descriptions (esp. UNN-544/545/546/548).
3. Jackson then diagnosed (with me) that the port felt like going *backwards*. Root causes we identified:
   - The cutover unit was "engine," not "vertical slice" — every surface's v1-worldview contract (`HydratedCharacter`, `CharacterEdit`, per-tab components) survived and demanded adapters. The sum of those adapters is a shadow engine in `apps/web/lib/game-v2/`.
   - The entity-kind distinction was killed in the engine but is still decided **three times** in the display layer (`HydratedCharacter` / `Statblock` / `CombatantDetail` — parallel per-kind flatteners; the F1 anti-pattern one level up).
   - A premise changed without re-sequencing: character data was declared **expendable** (2026-07-01, fresh-start/no-backfill), which invalidated "entity table last" (D23) — storage-last is what generates most of the scaffolding (`rawInputsToEntity`, `pool-write-adapter`, preserved row contracts).
4. A greenfield **app** was considered and rejected as over-scoped: combat is already thesis-correct and liftable, so the fault line is the *character domain*, not the app. **Characters v2 is the chosen middle ground**: rebuild-in-place inside apps/web (same shell/auth/realtime; combat untouched), old surfaces deleted as each new one ships, `packages/game` dies with the last one.
5. Jackson recently landed the game's name/brand — **Showtime!**, docs/brand/brand-guide.md — and wants the sheet/builder redesigned to it. The rebuild and the redesign are deliberately **fused**: every character surface is built once, on v2-native shapes, to the new brand. No pixel-parity porting.

## Scope

**In:** entity-table storage (UNN-511/PR12, **promoted to foundation** — first, not last); durable write-router (generalize CD18–CD20; UNN-511's own text already hints at it: "entityRowStore re-points … to native v2 component writes"); per-surface read models; rebuild of sheet, builder, Lineage Atlas, my-characters (+ command palette bindings) fused with the brand redesign; creation-time rules; the out-of-encounter-state decision; version-class → component-write mapping.

**Out (stays on its own track):** combat surfaces (already correct), dungeon exploration (UNN-540), bestiary engine projection (UNN-547's game-v2 half), drawer fix (UNN-538), engine gap modules (UNN-544 — a prerequisite that *grows* under this program).

## Required ADR decisions (the hard edges — put these front-door, do not discover mid-build)

1. **Storage.** Entity table shape (hot columns + components jsonb per D11/D23), fresh-start/no-backfill. What happens to `characters`/`characterArchetypes` tables and their FK consumers. Signed depletion native (no absolute columns, no pool-write-adapter — that artifact only existed for storage-last sequencing).
2. **Combat↔character coupling repoints.** Combat's durable arm reads the character row today: console loader's sheet slice (`CombatantSheetSlice` post-UNN-538), `vitalsVersion` in the composite snapshot fold (UNN-530), adjust-pools during combat, dungeon roster `id === characterId` continuity. CD7/CD19 designed the durable-entity seam as named-but-unbuilt; this ADR builds it. First-class work item.
3. **Write architecture.** Registry-driven component writes for durable entities (descriptor → writer → store, optimistic predictors like `COMPONENT_WRITERS`), replacing `CharacterEdit`/`reduceCharacter`/per-field wrappers. Decide: how per-write-class version guards (identity/vitals/inventory/progression classes, `bumpCharacterVersionGuarded`) map onto component-keyed writes — combat's router already routes `vitalsVersion`; generalize deliberately. Owner-mode discipline (per-field actions, server merges — see `apps/web/lib/actions/CLAUDE.md`, UNN-226 lesson) must survive the generalization.
4. **Read model standing rule.** Surfaces compose read-units; no shared flatteners beyond genuinely-shared slices. Also decide how a surface gets *both* row-ish data (name, portrait, narrative) and resolved read-units — one load boundary returning both, derived once.
5. **Out-of-encounter state.** Sheet-standalone Ailments/BattleConditions are a shipped feature, but v2 models these as encounter-*overlay* components, compile-time-disjoint from durable components (`packages/game-v2/src/encounter/disjointness.ts`). Either they become durable components in their own right (new keys, lifecycle defined) or the feature changes. PartyComposition: v2 is derive-only (`derivePartyComposition`); decide the standalone-sheet fallback. Deliberate product decision — do not let the schema default decide.
6. **Creation-time rules.** UNN-539's finding stands: v2 was built for play, not creation. Builder needs engine homes for allocation validation, path stats, initiate gating (UNN-544 authors `progression/virtue-allocation.ts` etc. — a prerequisite). Decide whether creation is a distinct engine concern (e.g. `progression/creation`) or app-composed validators.
7. **Content homing (reopen deliberately).** Talent/ailment display catalogs were routed to `apps/web/lib/ui/` under the "no engine display catalogs" policy — but skill descriptions live in the game-v2 catalog, so identical species of content would have two homes. With talents plausibly gaining mechanics someday, decide once: engine catalog with display fields (D32 pattern) vs app maps.
8. **Test strategy.** Derivation parity suites (`derive-parity`, `derivation-golden-master`) keep their v1 oracle until v1 dies — flip to pinned fixtures per the procedure already written into UNN-548 item 10 (reusable regardless of roadmap). New surfaces need new e2e (factory pattern per `apps/web/e2e/CLAUDE.md` transfers; specs don't — redesigned UI = new selectors). Write-path coverage: v1's `rest.test.ts`/`leveling.test.ts` case-for-case ports (UNN-544) are the only unit net under character writes.

## Verified facts to lean on (don't re-derive; distilled from the 2026-07-03/04 investigations)

- **jsonb/schema map:** all 9 mechanic per-kind states byte-identical v1↔v2; ManualBonuses identical; InheritanceSlots renamed (`sourceCharacterArchetypeId`→`sourceArchetypeKey`, D36); gainedTalents open-string in v2 (closed enum in v1); Ailments/BattleConditions/PartyComposition have **no durable v2 twin by architecture** (overlay/derive-only + disjointness wall); SparkLog has zero v2 presence (UNN-544 adds `sparkLogSchema`). BattleConditions passes a naive shape-diff while being lifecycle-divergent — shape equality ≠ re-type safety.
- **Skill shape:** v2 = flat base + facets. Renames: `damageType`/`delivery`/`hits` → `damage.*`; v1 inline `skill.damage` (string) → `skill.formula` (⚠️ name collision — v2 `skill.damage` is the typed object); tier formulas are `FormulaTerm[]`, flat/heal `formula` stays a string *by v2 design*. Renderers proven byte-equivalent (`catalog/skills/formulas.test.ts`). Both catalogs: **55 skills, identical keys, byte-identical display prose** (any "57 vs 58" reference is a dead phantom). The old-consumer ripple was ~5 files — mostly moot under a redesign, but the shape facts guide the new components.
- **Atlas:** v2 `buildLineageAtlas` takes `ResolvedEntity`; `characterArchetypeId`→`ownedKey` (archetype key, not row id) — rank-up keyed by archetype key is the natural v2 write shape.
- **game-v2 tooling:** coverage + Stryker rig fully ported and verified running (93% branch). Gap: **no CI workflow runs unit tests for either engine package** (Playwright only) — pre-existing; optional separate ticket.
- The stale spatial-ADR header and the general docs-behind-code drift: this ADR should also restore the "docs are canonical" invariant for the cutover program.

## Ticket disposition (do NOT touch Linear until the ADR is drafted and Jackson approves)

- **Survive as-is:** UNN-544 (grows: creation rules, sparkLogSchema, possibly durable-state components), UNN-540, UNN-538, UNN-547 (engine half), UNN-521/531/537/541/542 (independent).
- **Promoted:** UNN-511 (PR12) becomes the program's foundation slice.
- **Superseded pending ADR:** UNN-543/545/546/548/549 (the port-in-place waves). Their descriptions contain verified findings worth mining; the *sequencing* dies. After approval: cancel/supersede with comments linking here, mirror how UNN-532/534 were superseded, and update the UNN-510 roadmap comment.
- Session plan file with the full audit + reconciliation: `~/.claude/plans/i-am-in-the-glowing-scott.md`. Memory: `project_pr11_decomposition.md` + `project_characters_v2.md`.

## Process

Model the ADR on `docs/engine-v2/combat/ADR.md` + `decision-log.md` (CD-numbered decisions, Settled/Leaning/Open, requirements references — reuse `docs/engine-v2/requirements/` where it covers character behavior). Jackson runs plan mode and wants: candid design opinions with named patterns/lineage, testable `## Acceptance criteria` on eventual tickets, hard cutovers per slice, right-sized structure (real packages/modules where proportionate — e.g. the app-side character model likely becomes a real package or a tightly-CLAUDE.md'd folder, *not* loose `lib/` files). Sequencing bias: storage first, then write factory, then surfaces (each fused with its redesign, each deleting its old surface on landing). Expect him to grill the ADR — surface tradeoffs, don't pick silently.

Open questions to ask Jackson early (his calls, not yours): redesign depth per surface (sheet and builder confirmed; atlas/my-characters?); keep or change standalone-sheet ailments/battle-conditions tracking; sheet-first or builder-first; whether `@workspace/game-v2` renames to `@workspace/game` after v1 dies; whether to file the CI unit-test-gate ticket.
