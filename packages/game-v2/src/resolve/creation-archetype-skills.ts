import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { ORIGIN_ARCHETYPE_RANK } from "@workspace/game-v2/archetypes/creation"
import { resolveArchetypeSkills } from "@workspace/game-v2/archetypes/display"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"

import { createResolve } from "./resolve"

/**
 * Resolves an Origin Archetype's Skills against the Rank-2, equipment-less entity
 * used during character creation. This composition belongs above the Archetype
 * domain because it invokes the full entity resolve pipeline.
 */
export function resolveCreationArchetypeSkills(
  deps: Pick<GameData, "getArchetype" | "getSkill">
) {
  const resolve = createResolve(deps)

  return (archetype: Archetype, pathChoice: PathChoice) => {
    const entity: Entity = {
      id: "preview",
      components: {
        level: { value: 1, victories: 0 },
        path: { choice: pathChoice },
        archetypes: {
          active: archetype.key,
          origin: archetype.key,
          savedArchetypeRanks: 0,
          roster: [
            {
              key: archetype.key,
              rank: ORIGIN_ARCHETYPE_RANK,
              inheritanceSlots: [],
            },
          ],
        },
        attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
        affinities: { base: {} },
        vitals: { base: 0, damage: 0 },
        skillPool: { base: 0, spSpent: 0 },
      },
    }
    const resolved = resolve(entity)

    return resolveArchetypeSkills(
      archetype,
      resolved,
      {
        partyComposition: null,
        activeLineage: resolved.components.archetypes?.activeLineage ?? null,
      },
      deps.getSkill
    )
  }
}
