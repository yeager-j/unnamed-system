# `@workspace/game-v2`

The capability/component game engine — the successor to `@workspace/game` (v1).
Where v1 models participants with **nominal** types (the `CombatantRef` union, the
post-hoc `Statblock`), v2 models every participant — PC, enemy, NPC, object — as an
**`Entity` = a bag of named capability components**, and engine functions declare
the components they need. The full design is in [`docs/engine-v2/`](../../docs/engine-v2/):
the [ADR](../../docs/engine-v2/ADR.md) (clean current-state synthesis), the
[decision log](../../docs/engine-v2/decision-log.md) (chronological rationale incl.
reversals, D1–D45), the [requirements inventory](../../docs/engine-v2/requirements/)
(~440-requirement v1 behavior spec), and
[`_principles-review.md`](../../docs/engine-v2/_principles-review.md) (a fidelity
audit of the design against its own principles).

This package is **independent**: it imports **nothing** from `@workspace/game`
(D32), enforced by `npm run depcheck`. It runs in parallel with v1 until cutover.

## The model — an ECS, applied with judgment

The engine is an **ECS** (the design calls it "ECS-lite", D1) — but a _pure,
functional, turn-based_ one. **Adopt the modeling discipline; do not cargo-cult a
game engine's runtime machinery.** New code is held to the discipline, not the
folklore.

What ECS means here:

- **Entity** = `{ id; components: Partial<ComponentRegistry> }` — an id plus a bag
  of named components. A single `ComponentRegistry` is the source of truth; `Entity`,
  the capability views (`Has<K>`), and the runtime `guard`s all derive from it (§2.1,
  D16).
- **Systems are pure functions that declare the capabilities they need** as
  structural intersection types (`Has<"vitals" | "skillPool">`); a multi-key
  `guard(...keys)` factory narrows a jsonb-loaded entity to that view **once** at the
  boundary (structural types are compile-time only). Any entity carrying those
  components qualifies — PC, enemy, NPC, object run the same code path.
- **Capability-, not kind-discrimination, is the razor.** Engine logic carries **zero
  `kind` branches**; the closed `CombatantRef` union is the exact pain v2 exists to
  kill (D1). When you reach for `if (kind === …)`, you've found a missing capability.

Applied with judgment — _not_ cargo-culted:

- This is a turn-based RPG resolved by pure folds, **not** a real-time game loop. Take
  ECS's _composition_ insight; leave its performance machinery — **no** archetype/SoA
  storage, **no** system scheduler or per-tick iteration, **no** integer-handle entity
  pools, **no** mutable component arrays. `resolve` accepting "more computation per
  read" is a deliberate, accepted trade (ADR §3), offset by memoization — not a
  data-oriented rewrite.
- **Add a component because a system genuinely reads/writes it, not for symmetry.**
  Component _count_ isn't the risk — ECS embraces many small components — but each
  earns its place "by need, not anticipation" (decision-log). The granularity rule:
  the smallest cluster one system reads/writes together (O1, D8). Don't pre-split,
  don't bundle unlike things (F5 is the cautionary tale — "don't cargo-cult throw
  durable scalars in `Resources`"). Read `_principles-review.md` before adding a
  component or a `kind` tag.

## Core invariants

Load-bearing rules a new slice must preserve (ADR §-refs + D-numbers for the why):

- **`resolve` is one uniform fold, computed never stored** (§2.3; D5/D30/D37):
  `base` → layers applied **iff their component is present** (`Archetypes`;
  `Level` + `Path`) → effects (zone/mechanic/equipment/passive/manual/mastery) →
  clamp. It emits **resolved capability components** (`ResolvedComponentRegistry`),
  never a flat `ResolvedStatblock` god object — that was the anti-pattern D30 killed.
  Two registries: authored/stored (`ComponentRegistry`) vs computed
  (`ResolvedComponentRegistry`); reads consume the resolved entity, writes target the
  authored components then re-resolve.
- **Forms _are_ entities** (§2.3; D38/D47): a form swap is a pure `Entity → Entity`
  fold of the per-component `FORM_SWAP_POLICY` table (`resolve/form-swap-policy.ts`)
  run **before** `resolve` — no form struct, no form branch in the fold, no inline
  merge logic. Doctrine (D47): _a form is a body; you bring your mind, your wounds,
  and your capacity_ — `vitals`/`skillPool`/`level`/`path` are the self's and never
  the form's. Shapechanger and Nyx Arcana are the _same_ path.
- **Vitals are depletion** (§2.4; D9/D10/D26): store depletion (signed `damage`,
  `spSpent`, `*Used`), derive current (`currentHP = max(0, maxHP − damage)`). Over-max
  HP is just negative damage (no temp-HP buffer; `maxHP` stays honest); each
  **operation** owns its clamp (heal floors at 0, an HP cost is strict-`>`, SP is
  `>=`). One universal model across HP / SP / dice / Prisma.
- **Transitions return whole updated components** (UNN-601): a multi-component
  transition (the rest trio, `applyLevelUp`) returns a precise
  `Pick<ComponentRegistry, …>` of **whole** components — the one patch vocabulary
  the app's Writers and guarded column UPDATE speak — so callers assign each key
  wholesale, never merge per field. Field-level `Pick`s are the **atomic-op**
  pattern (`vitals/operations.ts`), merged *within* a component; that shape stops
  at the transition boundary.
- **Lifecycle is the storage axis** (§2.2/§2.5; D11–D13): durable (entity row +
  `components` jsonb) vs encounter-overlay (session blob) vs catalog (authored TS) —
  and it decides whether combat clears a component. Rule of thumb: _anything that must
  survive a form swap is its own component, never an overridden capability_ — enforced
  per component by `FORM_SWAP_POLICY` (D47): a new registry component fails the build
  until it declares a swap verdict.
- **The encounter is a Session container, not an entity** (§2.6; D29): the combat
  reducer stays pure `(session, event) → session`; the loader dissolves
  durable-vs-inline storage into a uniform `Participant.entity` so **no `kind` reaches
  engine logic**.
- **Rendering + redaction are capability/relationship-driven** (§2.7; D7/D25): one
  capability→widget library (`Vitals → HealthBar`); redaction is a uniform fold over
  **one enumerated `(component × relationship)` policy table** (relationship =
  f(viewer, allegiance, ownership)). "Drop" removes the component **key**
  structurally, not nulled.
- **Mechanics carry over v1's registry** (§2.8; D17/D41): engine-owned behavior,
  **not** a data port. `resolve` stays mechanics-agnostic; a composition-tier
  `resolveEntity` feeds active mechanics in — a form-swap mechanic via `applyForm`
  before `resolve`, the rest as `effects()` deltas.

## Layout (domain-first — D33)

```
src/
  kernel/          the component substrate everything builds on:
                   Entity / Has / guard, the ComponentRegistry +
                   ResolvedComponentRegistry, the load seam, the effects
                   primitive, Result, the GameData port, and the re-declared vocab
  attributes/ affinities/ vitals/ resources/ progression/ virtues/ archetypes/
  skills/ talents/ items/ mechanics/ combat/ encounter/ visibility/ resolve/
                   one folder per domain — and one folder per PR (the cohesion cut)
  catalog/         authored content implementing the GameData port
  composition.ts   binds catalog → engine (the createGameEngine equivalent)
  __fixtures__/    cross-domain test doubles — arbitraries/ holds arbitraryEntity
                   and the total per-component arbitrary map (see Laws, below)
```

PR1 (UNN-499) scaffolded `kernel/`; subsequent PRs have filled most domain
folders (fold/depletion, mechanics, items, combat, and friends). `encounter/` and
`visibility/` remain scaffolds their own PRs fill.

## The dependency gradient

`logic → schema → vocab`, `logic → ports`, **never** concrete `catalog/`. Two
load-bearing rules are hard-gated by `depcheck.mjs` (ESLint can't gate them —
the shared config's `only-warn` plugin downgrades import bans to warnings):

1. **Independence** — no `@workspace/game` imports anywhere (D32).
2. **Ports, not catalog** — engine logic never value-imports `catalog/`; it takes
   its lookups injected through `kernel/ports`, bound once in `composition.ts`.

The **registry grows by editing one kernel file**: each domain PR adds its
component as one line + a type-only import in `kernel/component-registry.ts` (and a
lookup in `kernel/ports.ts`). Those two files are the only kernel files allowed to
name a domain shape.

## Building a slice

- **Behavior is the acceptance spec** (D14): the ~440-requirement inventory in
  `docs/engine-v2/requirements/` is what v2 is built against — not a line-by-line v1
  port. Each requirement is **PRESERVE** (reproduce exactly) or **SUPERSEDE** (a
  decision deliberately changes it — cite the D-number).
- **Test-first to parity** (D15): build slice-by-slice red→green, and
  **golden-master the derivation math** — run v1 `deriveHydratedCharacter` and v2
  `resolve` over the same seeds and assert the resolved numbers match. Respect the
  3-tier test split (unit / integration / contract) v1 uses.
- **Greenfield carry-over** (D2): reuse v1's wins — foundation vocabulary, Zod-first
  discipline, the pure DI + composition root, the mechanics registry,
  exhaustive-switch reducers, the derive math — re-homed onto components.

## Laws (property-based tests)

Stryker mutates the **code**; fast-check mutates the **inputs**. The engine's
central claim — _any_ entity carrying the components qualifies — is universally
quantified over ~2^18 component subsets, and example tests only check points in
it. Laws close that gap (UNN-598).

```
src/__fixtures__/arbitraries/   arbitraryEntity + one arbitrary per component
src/<domain>/__laws__/          *.laws.test.ts — the properties themselves
```

- **`componentArbitraries` is total** over `ComponentRegistry`, exactly as
  `load-seam.ts`'s schema map is: a new component without an arbitrary is a
  **compile error**, so add both in the same PR. Every arbitrary must emit a value
  that is already a fixed point of its load schema (defaulted fields present,
  optional fields absent rather than `undefined`) — `arbitraries.test.ts` pins that
  as a meta-property, so the generator can't drift from the schemas.
- **Catalog keys are injected, never imported** (`CatalogVocab`) — the same
  ports-not-catalog discipline `depcheck.mjs` enforces on engine logic. Pass
  `HOSTILE_VOCAB` to generate dangling references: the load seam validates a key's
  *shape*, never its *referent*, so "does `resolve` survive any bag that parses?"
  is the stronger totality question and the one that finds real bugs.
- Use `record` from `__fixtures__/arbitraries/record`, not `fc.record` — it pins
  `noNullPrototype`, without which `toStrictEqual` fails on prototype noise.
- `__laws__` modules that aren't `*.test.ts` (a property shared between a law and
  its negative control) are test code: excluded from the coverage and Stryker
  `mutate` sets, but they still run under Stryker and kill mutants.
- **A green property proves nothing until it can go red.** `vitals/__laws__/negative-control.laws.test.ts`
  aims the heal-clamp property at a deliberately broken clamp and asserts it fails.
  Add one whenever a law guards a subtle invariant.

### Reproducing a failure

Seeds are **random by default** — that is the point; a pinned seed turns a law into
a slow example test that stops discovering after its first green run. On failure
fast-check prints the seed and the shrink path:

```bash
FC_SEED=1234567890 npm run test -w packages/game-v2   # replay that exact run
FC_NUM_RUNS=2000 npm run test                         # deepen the search
```

The `test` task is **uncached** in `turbo.json`. A cached task is skipped on a cache
hit, and with an unset `FC_SEED` nothing about the run changes when the sources
don't — so a cached `test` would replay the first green result forever and the laws
would stop sampling new inputs, which is the one thing they exist to do. Declaring
`FC_SEED` in `globalEnv` only invalidates the cache when the seed is *set*; that
covers replay, not exploration.

## Known design tensions

Two `kind` tags survived the capability cut and are flagged **betrays-thesis** in
`_principles-review.md` — don't let new code lean on them:

- **`Participant` storage locator** (durable `entityId` vs inline `Entity`, F1):
  collapse both arms to an `Entity` at the **one** loader boundary; never branch on a
  `ref.kind` downstream (that's how `CombatantRef` arms multiplied).
- **`Presentation.kind`** (F4): keep it cosmetic only (`{ portraitUrl?, label? }`).
  Route "is this a PC?" through a capability or the durable `entity.kind` **column**,
  never a component `kind`.

## Scripts

```bash
npm run typecheck      # tsc --noEmit
npm run depcheck       # the hard independence + no-concrete-catalog gate
npm run test           # vitest
npm run test:coverage  # branch-coverage gap-finder (logic files only)
npm run test:mutation  # Stryker (off the PR critical path)
```
