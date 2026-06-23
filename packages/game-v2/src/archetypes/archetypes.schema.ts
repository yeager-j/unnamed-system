import { z } from "zod/v4"

/**
 * The **Archetypes** component (D36) — a PC's archetype roster: which Archetypes
 * are unlocked and at what rank, which is active, which is the origin, and the
 * bank of saveable ranks. PC-specific (enemies don't carry it). One cohesive
 * write surface (the Atlas / archetype screen).
 *
 * `resolve` reads `active` (→ base attributes/affinities via `getArchetype`) and
 * the `roster` ranks (the mastery walk, C4 — applies at rank ≥ 5 even when
 * inactive). v2 keys the roster by Archetype `key` (one entry per Archetype), so
 * `active`/`origin` are keys — simpler than v1's surrogate `characterArchetype`
 * row ids.
 *
 * **PR2 scope:** key + rank (all derivation needs). Per-archetype
 * `inheritanceSlots` and `mechanicState` fold in with the inheritance fold and
 * the `Mechanics` component respectively (D36) — additive, their PRs.
 */
export const archetypesSchema = z.object({
  active: z.string().nullable(),
  origin: z.string().nullable(),
  savedArchetypeRanks: z.number().int().min(0),
  roster: z.array(
    z.object({
      key: z.string().min(1),
      rank: z.number().int().min(1),
    })
  ),
})

export type Archetypes = z.infer<typeof archetypesSchema>
