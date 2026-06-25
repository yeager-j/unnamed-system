# Data catalogs — the shared factory

The hardcoded-TS data catalogs (`data/skills`, `data/items`,
`data/enemies`) all share this module so they don't drift. Each is a
collection of by-key entry objects with no database; lookups are O(1) and the
pressure at scale is authoring ergonomics and consistency, not runtime.

> `mechanics/registry.ts` is **not** one of these. It is keyed by `kind` over a
> closed `MechanicKind` union and carries behavior (`initialState`, `effects`),
> not just data. Do not fold it in here.

## `createCatalog(entriesByKey, validate?)`

Returns `{ all, get, keys }` over the by-key object and, when `validate` is
given, runs it once per entry **at module load** (fail-fast: a malformed or
typo'd entry breaks the import, not a later lookup). Each registry passes its own
validator so cross-catalog checks (e.g. "every `skillKey` resolves") stay where
they belong.

`createCatalog` is deliberately **not** generic over the key literal. The
load-bearing key union stays in each registry as:

```ts
const X_BY_KEY = { ... } as const satisfies Record<string, T>
export type XKey = keyof typeof X_BY_KEY
```

That literal union is what makes a typo'd cross-reference (`skillKey: SkillKey`,
`skillKeys: SkillKey[]`) a **compile error**. Keep it.

## Per-category slices

Each registry shards its `*_BY_KEY` object across the category folders to keep
the registry file from becoming a merge-conflict hotspot. A category folder
exports its slice; the registry spreads the slices:

```ts
// skills/fire/index.ts
export const FIRE_SKILLS = { agi } as const satisfies Record<string, Skill>

// skills/registry.ts
const SKILLS_BY_KEY = {
  ...FIRE_SKILLS,
  ...SLASH_SKILLS,
  // ...
} as const satisfies Record<string, Skill>
```

Spreading `as const` slices into an outer `as const` preserves both the literal
key union and the per-entry value types. Adding an entry touches **one**
category `index.ts`.

## The meta-test — `loadCatalogEntryModules` + `findUnregisteredEntries`

Closes the silent forget-to-register gap: an entry file that's added on disk but
never spread into a slice would otherwise just not exist, and no test would
notice. Each registry test walks its entry files and asserts they're all
registered:

```ts
it("registers every entry file on disk", async () => {
  const modules = await loadCatalogEntryModules(import.meta.dirname)
  expect(findUnregisteredEntries(modules, getSkill)).toEqual([])
})
```

`loadCatalogEntryModules` reads every `*.ts` under a category subfolder of the
catalog dir (skipping the registry's top-level files, the per-category slice
`index.ts`, and tests) and imports each — yielding the same module singletons
the registry imported, so `findUnregisteredEntries` can compare by identity. We
use `fs` + dynamic import rather than `import.meta.glob` because `vite` isn't a
hoisted dependency in this monorepo, so `vite/client`'s glob types don't resolve
under `tsc`.

These two helpers live in `registered-entries.ts` and import `node:fs`, so they
are **test-only**. Import them from
`@workspace/game/data/catalog/registered-entries` directly so a registry pulling
`createCatalog` from `@workspace/game/data/catalog/create-catalog` never drags
`node:fs` into the client bundle.
