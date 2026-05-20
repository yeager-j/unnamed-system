import type { CharacterArchetypeRow } from "@/lib/db/load-character"
import type { Archetype } from "@/lib/game/archetypes/schema"
import type { HydratedSkill } from "@/lib/game/hydrated-character"

/** A {@link HydratedSkill} tagged with the Archetype Rank it unlocks at —
 *  what the Archetypes tab uses to group an Archetype's Skills by Rank. */
export type RankedSkill = HydratedSkill & { rank: number }

/**
 * An Inheritance Slot resolved against the character's other Archetype rows:
 * `sourceArchetypeName` is the display name of the Archetype the slot draws
 * from (`null` when the slot is empty or its source row no longer exists),
 * and `resolved` is the filling Skill + cost (`null` when the slot is empty
 * or its `skillKey` no longer resolves). Both `null` ⇒ a vacant slot the
 * detail block renders as "Empty slot".
 */
export interface ResolvedInheritanceSlot {
  slotIndex: number
  sourceArchetypeName: string | null
  resolved: HydratedSkill | null
}

/**
 * Everything the Archetypes-tab views need for one unlocked Archetype, with
 * cross-references already resolved against the rest of the hydrated
 * character. Built once in the server parent so the {@link ArchetypeDetail}
 * (server) and {@link ArchetypeSummary} (client, for the Drawer) views consume
 * the same pre-resolved values without re-doing lookups.
 */
export interface ArchetypeEntry {
  archetype: Archetype
  row: CharacterArchetypeRow
  isActive: boolean
  /** Every Rank-keyed Skill the Archetype declares, sorted by Rank ascending. */
  ranks: RankedSkill[]
  /**
   * The Archetype's Synthesis Skill resolved to a {@link RankedSkill}, or
   * `null` when the Archetype declares none. The view layer decides whether
   * to *show* it based on `rank ≤ row.rank` — the field carries every
   * Synthesis Skill the Archetype declares so the schema can later widen to
   * multiple without changing this shape.
   */
  synthesis: RankedSkill | null
  /** Per-slot resolution; length equals `archetype.inheritanceSlots`. */
  slots: ResolvedInheritanceSlot[]
}
