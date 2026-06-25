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
 * **PR5 wires only the equipment source.** PR6 (UNN-504) prepends the archetype-kit
 * and inheritance sources here — but they do **not** share equipment's form
 * semantics, so they must read their own form-correct field, NOT blindly take this
 * function's entity:
 *
 * - **equipment** → passes through a form (read the `equipment` component, which
 *   `applyForm` never touches — so passing the formed entity is safe).
 * - **inheritance** → passes through a form (read `archetypes.roster`, which
 *   `applyForm` preserves, like Mastery).
 * - **archetype-kit** → **suppressed** under a form (read `archetypes.active`, which
 *   `applyForm` nulls — so a form's base replacing the archetype's kit falls out for
 *   free, D19).
 *
 * So PR6 should take whichever of `entity`/`formed` each sub-source needs, not
 * assume one entity serves all three.
 */
export function passiveSkillEffects(
  deps: Pick<GameData, "getEquippableItem" | "getSkill">,
  entity: Entity
): CombatantEffect[] {
  return [
    // PR6: ...archetypeKitEffects(deps, entity)  — suppressed under a form
    // PR6: ...inheritanceEffects(deps, entity)   — passes through a form
    ...equipmentEffects(deps, entity),
  ]
}
