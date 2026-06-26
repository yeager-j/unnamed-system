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
 * Kit + inheritance are both **active-archetype-scoped** (an inherited passive applies
 * only while its owning Archetype is active). They differ in **form semantics**
 * (D19/D38), realized by which entity each reads:
 *
 * - **archetype-kit** → reads the **form-merged** entity ⇒ **suppressed** under a form
 *   (`applyForm` nulls `active`; the form's base replaces the archetype kit for free).
 * - **inheritance** → reads the **original** (pre-form) entity ⇒ active-scoped, yet
 *   **passes through a form** (D19): the inherited kit you brought survives a Shapechange.
 * - **equipment** → reads the form-merged entity (the `equipment` component is untouched
 *   by `applyForm`, so it passes through either way).
 *
 * `formed === original` whenever no form is active, so this collapses to one entity in
 * the common case.
 */
export function passiveSkillEffects(
  deps: Pick<GameData, "getArchetype" | "getEquippableItem" | "getSkill">,
  formed: Entity,
  original: Entity
): CombatantEffect[] {
  return [
    // C6 contributor order WITHIN this channel: kit → inheritance → equipment. The
    // active mechanic precedes (prepended by `resolveEntity`), context effects follow.
    ...archetypeKitEffects(deps, formed), // suppressed under a form
    ...inheritanceEffects(deps, original), // active-scoped, survives a form
    ...equipmentEffects(deps, formed),
  ]
}
