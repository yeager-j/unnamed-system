import fc from "fast-check"

import { componentArbitraries } from "@workspace/game-v2/__fixtures__/arbitraries/components"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import {
  arbitrarySlug,
  HOSTILE_VOCAB,
  type CatalogVocab,
} from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"

export type ComponentKey = keyof ComponentRegistry

export interface ArbitraryEntityOptions {
  /**
   * The catalog keys generated components may reference. Omit — or pass
   * {@link HOSTILE_VOCAB} — to generate dangling references, which is the harder
   * and truer totality question: the load seam validates a key's shape, never
   * that its referent exists.
   */
  vocab?: CatalogVocab
  /** Components every generated entity must carry. The rest appear independently. */
  require?: readonly ComponentKey[]
}

/**
 * An arbitrary {@link Entity} — an id plus an arbitrary **subset** of the
 * component registry, each component an arbitrary inhabitant of its load schema.
 *
 * This is the quantifier the engine's central claim needs. "*Any* entity carrying
 * the components qualifies" ranges over ~2^18 component subsets; example tests
 * check points in that space and Stryker mutates the code rather than the input.
 * `arbitraryEntity` is the other half.
 *
 * Every generated bag parses through `loadEntity` unchanged — pinned as a
 * meta-property in `arbitraries.test.ts`, so the generator cannot drift from the
 * schemas it claims to inhabit.
 */
export function arbitraryEntity(
  options: ArbitraryEntityOptions = {}
): fc.Arbitrary<Entity> {
  const vocab = options.vocab ?? HOSTILE_VOCAB
  const bound = Object.fromEntries(
    Object.entries(componentArbitraries).map(([key, make]) => [
      key,
      make(vocab),
    ])
  ) as { [K in ComponentKey]: fc.Arbitrary<ComponentRegistry[K]> }

  return record({
    id: arbitrarySlug,
    components: record(bound, {
      requiredKeys: options.require ? [...options.require] : [],
    }),
  })
}
