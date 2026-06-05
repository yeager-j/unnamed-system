/**
 * A read-only view over a hardcoded data catalog: the array of every entry, the
 * list of keys, and a string-keyed lookup. Backs the `skills`, `items`, and
 * `enemies` registries so they share one lookup/validation implementation while
 * each keeps its own `*_BY_KEY` literal for the load-bearing key union.
 */
export interface Catalog<TEntry> {
  readonly all: readonly TEntry[]
  readonly keys: readonly string[]
  get(key: string): TEntry | undefined
}

/**
 * Builds a {@link Catalog} from a by-key object. When `validate` is supplied it
 * runs once per entry at **construction time** (i.e. module load), so a malformed
 * or typo'd entry fails the import rather than a downstream lookup — the
 * fail-fast philosophy the items/enemies catalogs already used, now shared.
 *
 * Intentionally **not** generic over the key literal: the precise key union that
 * powers cross-catalog referential integrity stays as
 * `keyof typeof X_BY_KEY` in each registry. This factory only owns the runtime
 * lookup, array view, and validation pass.
 */
export function createCatalog<TEntry>(
  entriesByKey: Record<string, TEntry>,
  validate?: (entry: TEntry) => void
): Catalog<TEntry> {
  const entries = Object.entries(entriesByKey)

  if (validate) {
    for (const [, entry] of entries) {
      validate(entry)
    }
  }

  const index = new Map<string, TEntry>(entries)

  return {
    all: entries.map(([, entry]) => entry),
    keys: entries.map(([key]) => key),
    get: (key) => index.get(key),
  }
}
