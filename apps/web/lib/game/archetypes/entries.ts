import { toStatComputationCharacter } from "@/lib/db/load-character"
import type { CharacterArchetypeRow } from "@/lib/db/load-character"
import type { HydratedCharacter, HydratedSkill } from "../hydrated-character"
import { resolveSkillCost, type CastingCharacter } from "../skill-cost"
import { getSkill } from "../skills"
import { getArchetype } from "./index"
import {
  ARCHETYPE_TIERS,
  LINEAGES,
  type Archetype,
  type Lineage,
} from "./schema"

/**
 * Per-character resolution of an unlocked Archetype: the catalog entry, the
 * persisted row, the active-flag, the Rank-keyed Skills paired with their
 * resolved costs, the Synthesis Skill (if declared), and every Inheritance
 * Slot resolved against the character's other Archetype rows. Pure domain
 * shaping — every display surface (the Archetypes tab today; future
 * level-up summaries, server actions, the public sheet) consumes the same
 * pre-resolved bundle without re-doing the catalog lookups or cost work.
 */

/** A {@link HydratedSkill} tagged with the Archetype Rank it unlocks at. */
export type RankedSkill = HydratedSkill & { rank: number }

/**
 * An Inheritance Slot resolved against the character's other Archetype rows:
 * `sourceArchetype` is the catalog entry the slot draws from (`null` when
 * the slot is empty or its source row no longer exists), and `resolved` is
 * the filling Skill + cost (`null` when the slot is empty or its `skillKey`
 * no longer resolves). Both `null` ⇒ a vacant slot the detail block renders
 * as "Empty slot".
 */
export interface ResolvedInheritanceSlot {
  slotIndex: number
  sourceArchetype: Archetype | null
  resolved: HydratedSkill | null
}

/**
 * Everything any per-Archetype surface needs for one unlocked Archetype,
 * with cross-references already resolved against the rest of the hydrated
 * character. Built once so multiple views can consume the same pre-resolved
 * values without re-doing lookups.
 */
export interface ArchetypeEntry {
  archetype: Archetype
  row: CharacterArchetypeRow
  isActive: boolean
  /** Every Rank-keyed Skill the Archetype declares, sorted by Rank ascending. */
  ranks: RankedSkill[]
  /**
   * The Archetype's Synthesis Skill resolved to a {@link RankedSkill}, or
   * `null` when the Archetype declares none. Consumers decide whether to
   * *show* it based on `rank ≤ row.rank` — the field carries every Synthesis
   * Skill the Archetype declares so the schema can later widen to multiple
   * without changing this shape.
   */
  synthesis: RankedSkill | null
  /** Per-slot resolution; length equals `archetype.inheritanceSlots`. */
  slots: ResolvedInheritanceSlot[]
}

/**
 * Resolves the hydrated character's Archetype rows into pre-resolved
 * {@link ArchetypeEntry} bundles — Skill catalog lookups, Skill-cost
 * resolution against the character's current max HP, and inheritance-slot
 * source-Archetype resolution all happen once here. Rows whose
 * `archetypeKey` no longer resolves to a catalog entry are skipped (data
 * drift after a deploy).
 */
export function buildArchetypeEntries(
  character: HydratedCharacter
): ArchetypeEntry[] {
  const stats = toStatComputationCharacter(character)
  const casting: CastingCharacter = {
    ...stats,
    currentHP: character.currentHP,
    currentSP: character.currentSP,
  }

  const archetypeByRowId = new Map<string, Archetype>()
  for (const row of character.archetypeRows) {
    const archetype = getArchetype(row.archetypeKey)
    if (archetype) archetypeByRowId.set(row.id, archetype)
  }

  function resolveSkillByKey(key: string): HydratedSkill | null {
    const skill = getSkill(key)
    if (!skill) return null
    return { ...skill, resolvedCost: resolveSkillCost(skill, casting) }
  }

  return character.archetypeRows.flatMap((row) => {
    const archetype = archetypeByRowId.get(row.id)
    if (!archetype) return []

    const ranks: RankedSkill[] = archetype.skills.flatMap((reference) => {
      const resolved = resolveSkillByKey(reference.skill)
      if (!resolved) return []
      return [{ ...resolved, rank: reference.rank }]
    })

    const synthesisReference = archetype.synthesisSkill
    const synthesisResolved = synthesisReference
      ? resolveSkillByKey(synthesisReference.skill)
      : null
    const synthesis: RankedSkill | null =
      synthesisReference && synthesisResolved
        ? { ...synthesisResolved, rank: synthesisReference.rank }
        : null

    const slots: ResolvedInheritanceSlot[] = row.inheritanceSlots.map(
      (slot) => ({
        slotIndex: slot.slotIndex,
        sourceArchetype: slot.sourceCharacterArchetypeId
          ? (archetypeByRowId.get(slot.sourceCharacterArchetypeId) ?? null)
          : null,
        resolved: slot.skillKey ? resolveSkillByKey(slot.skillKey) : null,
      })
    )

    return [
      {
        archetype,
        row,
        isActive: row.id === character.activeArchetypeId,
        ranks,
        synthesis,
        slots,
      },
    ]
  })
}

export interface LineageGroup {
  lineage: Lineage
  entries: ArchetypeEntry[]
}

const LINEAGE_ORDER: Record<Lineage, number> = Object.fromEntries(
  LINEAGES.map((lineage, index) => [lineage, index])
) as Record<Lineage, number>

const TIER_ORDER = Object.fromEntries(
  ARCHETYPE_TIERS.map((tier, index) => [tier, index])
) as Record<(typeof ARCHETYPE_TIERS)[number], number>

/**
 * Groups Archetype entries by Lineage in the rulebook's canonical Lineage
 * order, then by Tier within each Lineage (initiate → paragon, then by key).
 * Skips Lineages with no unlocked Archetypes — the Lineage list is a player
 * progress view, not a catalog teaser.
 */
export function groupByLineage(entries: ArchetypeEntry[]): LineageGroup[] {
  const grouped = new Map<Lineage, ArchetypeEntry[]>()
  for (const entry of entries) {
    const bucket = grouped.get(entry.archetype.lineage) ?? []
    bucket.push(entry)
    grouped.set(entry.archetype.lineage, bucket)
  }

  return [...grouped.entries()]
    .map<LineageGroup>(([lineage, groupEntries]) => ({
      lineage,
      entries: [...groupEntries].sort((a, b) => {
        const tierDelta =
          TIER_ORDER[a.archetype.tier] - TIER_ORDER[b.archetype.tier]
        if (tierDelta !== 0) return tierDelta
        return a.archetype.key.localeCompare(b.archetype.key)
      }),
    }))
    .sort((a, b) => LINEAGE_ORDER[a.lineage] - LINEAGE_ORDER[b.lineage])
}
