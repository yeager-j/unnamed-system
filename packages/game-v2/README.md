# `@workspace/game-v2`

The capability/component game engine — the successor to `@workspace/game` (v1).
Where v1 models participants with **nominal** types (the `CombatantRef` union, the
post-hoc `Statblock`), v2 models every participant — PC, enemy, NPC, object — as an
**`Entity` = a bag of named capability components**, and engine functions declare
the components they need. The full design is in
[`docs/engine-v2/`](../../docs/engine-v2/) (ADR + decision log, D1–D33).

This package is **independent**: it imports **nothing** from `@workspace/game`
(D32), enforced by `npm run depcheck`. It runs in parallel with v1 until cutover.

## Layout (domain-first — D33)

```
src/
  kernel/          the component substrate everything builds on:
                   Entity / Has / guard, the ComponentRegistry +
                   ResolvedComponentRegistry, the load seam, the effects
                   primitive, Result, the GameData port, and the re-declared vocab
  vitals/ progression/ archetypes/ skills/ items/ mechanics/ combat/ encounter/ visibility/
                   one folder per domain — and one folder per PR (the cohesion cut)
  catalog/         authored content implementing the GameData port
  composition.ts   binds catalog → engine (the createGameEngine equivalent)
```

As of PR1 (UNN-499) only `kernel/` is populated; the domain folders are scaffolds
their own PRs fill.

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

## Scripts

```bash
npm run typecheck      # tsc --noEmit
npm run depcheck       # the hard independence + no-concrete-catalog gate
npm run test           # vitest
npm run test:coverage  # branch-coverage gap-finder (logic files only)
npm run test:mutation  # Stryker (off the PR critical path)
```
