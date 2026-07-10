@AGENTS.md

## Composition and naming seam

- `composition.ts` binds functions that depend on `GameData`; dependency-free helpers are imported from their domain barrels by app-side `lib/**` modules.
- Catalog-dependent shapers are named for game content. Consumer surfaces and their partitions are named in `apps/web/lib/*/view`.
- The resolve tier may compose Archetype helpers; `archetypes/**` must not import `resolve/**`. `depcheck.mjs` enforces this direction.
