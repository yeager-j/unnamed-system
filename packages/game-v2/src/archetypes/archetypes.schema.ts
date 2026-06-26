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
 * `mechanicState` does **not** live here — it is a standalone `Mechanics`
 * capability any entity carries (D36); `resolve` maps `active → mechanic → reads
 * Mechanics.states`. Per-archetype `inheritanceSlots` **do** fold onto each roster
 * entry (D36 collapsed D19's speculative standalone `Inheritance` component) — the
 * inheritance resolve layer reads the active archetype's slots from here (UNN-504).
 */

/**
 * One configured Inheritance Slot on a roster entry (D36): a Skill inherited from
 * **another** unlocked Archetype, referenced by source Archetype **key** (v2 keys
 * the roster by key, replacing v1's surrogate `characterArchetype` row id). Both
 * `null` ⇒ an empty slot (always valid). The picker prevents *writing* an invalid
 * slot; the read side surfaces a stale one via the resolved slot's `isValid` flag.
 */
export const inheritanceSlotSchema = z.object({
  slotIndex: z.number().int().nonnegative(),
  sourceArchetypeKey: z.string().nullable(),
  skillKey: z.string().nullable(),
})

export type InheritanceSlot = z.infer<typeof inheritanceSlotSchema>

export const archetypesSchema = z.object({
  active: z.string().nullable(),
  origin: z.string().nullable(),
  savedArchetypeRanks: z.number().int().min(0),
  roster: z.array(
    z.object({
      key: z.string().min(1),
      rank: z.number().int().min(1),
      /** Per-Archetype Inheritance Slots (D36); defaults empty for legacy rows. */
      inheritanceSlots: z.array(inheritanceSlotSchema).default([]),
    })
  ),
})

export type Archetypes = z.infer<typeof archetypesSchema>
