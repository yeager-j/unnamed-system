import { toStatComputationCharacter } from "@/lib/db/load-character"
import { getArchetype } from "@/lib/game/archetypes"
import type { Archetype, Lineage } from "@/lib/game/archetypes/schema"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"
import { resolveSkillCost, type CastingCharacter } from "@/lib/game/skill-cost"
import { getSkill } from "@/lib/game/skills"
import { LINEAGE_ORDER, TIER_ORDER } from "./lineage-labels"
import type {
  ArchetypeEntry,
  RankedSkill,
  ResolvedInheritanceSlot,
  ResolvedSkill,
} from "./types"

/**
 * Resolves the hydrated character's Archetype rows into the pre-resolved
 * {@link ArchetypeEntry} shape both the featured Active card and each compact
 * summary consume — Skill catalog lookups, Skill-cost resolution against the
 * character's current max HP, and inheritance-slot source-Archetype names
 * happen once here. Rows whose `archetypeKey` no longer resolves to a catalog
 * entry are skipped (data drift after a deploy).
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

  function resolveSkillByKey(key: string): ResolvedSkill | null {
    const skill = getSkill(key)
    if (!skill) return null
    return { skill, cost: resolveSkillCost(skill, casting) }
  }

  return character.archetypeRows.flatMap((row) => {
    const archetype = archetypeByRowId.get(row.id)
    if (!archetype) return []

    const ranks: RankedSkill[] = archetype.skills.flatMap((reference) => {
      const resolved = resolveSkillByKey(reference.skill)
      if (!resolved) return []
      return [{ rank: reference.rank, ...resolved }]
    })

    const synthesisReference = archetype.synthesisSkill
    const synthesisResolved = synthesisReference
      ? resolveSkillByKey(synthesisReference.skill)
      : null
    const synthesis: RankedSkill | null =
      synthesisReference && synthesisResolved
        ? { rank: synthesisReference.rank, ...synthesisResolved }
        : null

    const slots: ResolvedInheritanceSlot[] = row.inheritanceSlots.map(
      (slot) => ({
        slotIndex: slot.slotIndex,
        sourceArchetypeName: slot.sourceCharacterArchetypeId
          ? (archetypeByRowId.get(slot.sourceCharacterArchetypeId)?.name ??
            null)
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
