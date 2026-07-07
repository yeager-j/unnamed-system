import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

/**
 * Labels each collected Skill's provenance for the card's effect line
 * (design handoff: `Knight —`, `Inherited · Mage —`). Derived from the same
 * facts the engine's `collectSkills` walked — the active Archetype's kit +
 * the active roster entry's inheritance slots; a Skill outside both (an
 * equipment grant, an intrinsic) gets no label and its effect renders bare.
 */
export function skillSourceLabels(
  resolved: ResolvedEntity,
  getArchetype: (key: string) => Archetype | undefined
): Map<string, string> {
  const labels = new Map<string, string>()
  const archetypes = resolved.components.archetypes
  if (!archetypes?.active) return labels

  const active = getArchetype(archetypes.active)
  if (active) {
    for (const reference of active.skills) {
      labels.set(reference.skill, active.name)
    }
    if (active.synthesisSkill) {
      labels.set(active.synthesisSkill.skill, active.name)
    }
  }

  const activeEntry = archetypes.roster.find(
    (entry) => entry.key === archetypes.active
  )
  for (const slot of activeEntry?.inheritanceSlots ?? []) {
    if (!slot.skillKey || !slot.sourceArchetypeKey) continue
    const source = getArchetype(slot.sourceArchetypeKey)
    labels.set(
      slot.skillKey,
      `Inherited · ${source?.name ?? slot.sourceArchetypeKey}`
    )
  }

  return labels
}
