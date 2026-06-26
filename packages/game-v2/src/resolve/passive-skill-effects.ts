import {
  archetypeKitEffects,
  inheritanceEffects,
} from "@workspace/game-v2/archetypes/passive-effects"
import { equipmentEffects } from "@workspace/game-v2/items/equipment-effects"
import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The resolved **passive-skill effects channel** (D19): passive skills are a
 * *resolved output* of (archetype ∪ equipment ∪ inheritance), not an authored
 * component, so this is the one place those sources are unioned, in C6 contributor
 * order. `resolveEntity` splices the result **between** the active mechanic and the
 * context effects (the order the attack-roll readout preserves).
 *
 * The three sources differ in **form semantics** (D19/D38), realized by which field
 * each reads off the **form-merged** entity `resolveEntity` hands this function:
 *
 * - **archetype-kit** → **suppressed** under a form (reads `archetypes.active`, which
 *   `applyForm` nulls — a form's base replacing the archetype kit falls out for free).
 * - **inheritance** → passes through a form (reads the whole `archetypes.roster`,
 *   which `applyForm` preserves, like Mastery).
 * - **equipment** → passes through a form (reads the `equipment` component, untouched
 *   by `applyForm`).
 */
export function passiveSkillEffects(
  deps: Pick<GameData, "getArchetype" | "getEquippableItem" | "getSkill">,
  entity: Entity
): CombatantEffect[] {
  return [
    // C6 contributor order WITHIN this channel: kit → inheritance → equipment. The
    // active mechanic precedes (prepended by `resolveEntity`), context effects follow.
    ...archetypeKitEffects(deps, entity), // suppressed under a form (reads `active`)
    ...inheritanceEffects(deps, entity), // passes through a form (reads `roster`)
    ...equipmentEffects(deps, entity),
  ]
}
