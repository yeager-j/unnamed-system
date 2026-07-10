import fc from "fast-check"

import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The **referential vocabulary** an entity's components point at: the catalog keys
 * a generated bag may name. It is *injected*, never imported, for the same reason
 * the engine takes its lookups through `kernel/ports` — an arbitraries module that
 * reached into `catalog/` would put a `logic → catalog` value arrow in the package
 * and trip `depcheck.mjs`. The engine's own laws pass a fixture vocabulary; the
 * app's laws pass the real catalog's keys.
 */
export interface CatalogVocab {
  archetypeKeys: readonly string[]
  skillKeys: readonly string[]
  itemKeys: readonly string[]
  talentKeys: readonly string[]
  /**
   * Whole authored Skills a generated `skills` component may carry **inline**
   * (the `kind: "inline"` arm of `skillRefSchema`). Drawn from, not fuzzed: a
   * Skill is authored catalog data, and its schema is not what these laws are
   * quantifying over. An empty pool means the inline arm is never generated.
   */
  inlineSkills: readonly Skill[]
}

/**
 * The vocabulary of a **hostile** bag: no catalog key resolves, so every reference
 * is a dangling slug. This is the vocabulary that asks the harder totality
 * question — "does `resolve` survive *any* bag that parses?" — because the load
 * seam validates a key's **shape** (`z.string()`), never its **referent**. A
 * corrupted or hand-edited row reaches `resolve` exactly like this.
 *
 * Empty pools are the representation, not a special flag: {@link arbitraryKey}
 * falls back to a free slug when its pool is empty, so the referential/hostile
 * distinction is decided once — here, at the vocabulary boundary — and every
 * component arbitrary downstream is blind to it.
 */
export const HOSTILE_VOCAB: CatalogVocab = {
  archetypeKeys: [],
  skillKeys: [],
  itemKeys: [],
  talentKeys: [],
  inlineSkills: [],
}

/**
 * A catalog slug: lowercase alphanumerics and hyphens, non-empty. The tightest
 * alphabet every keyed schema accepts (`itemKeySchema`'s regex is the strictest;
 * the archetype/skill/talent keys only demand `.min(1)`), so one slug arbitrary
 * serves them all and a hostile key still *parses* — which is the point.
 */
export const arbitrarySlug: fc.Arbitrary<string> = fc.string({
  unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"),
  minLength: 1,
  maxLength: 12,
})

/** A key drawn from `pool`, or a free slug when the pool is empty (hostile mode). */
export function arbitraryKey(pool: readonly string[]): fc.Arbitrary<string> {
  return pool.length > 0 ? fc.constantFrom(...pool) : arbitrarySlug
}
