import type { AttackRollContext } from "@workspace/game-v2/combat/attack-roll"
import type { IntrinsicAttack } from "@workspace/game-v2/items/item.schema"
import { getEquippedItem } from "@workspace/game-v2/items/resolve-inventory"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The entity's resolved **basic attack** (D22 carve-out): the form's natural
 * attack if one is active, else the equipped weapon's intrinsic attack, else none.
 * "A bear claws, it doesn't swing your greatsword" — the basic attack is treated as
 * *body*, so a form replaces it, while equipment-granted *skills* still pass through
 * the form (that's the effects channel, not here). A free function over the entity,
 * **not** folded into `resolve`/`ResolvedComponentRegistry` (it resolves per-use,
 * like `resolveAttackRoll`). Homed in `items/` (it reads `equipment`), depending on
 * `combat`/its own schema for the `IntrinsicAttack` type only.
 */
export interface ResolvedBasicAttack {
  source: "form" | "weapon"
  attack: IntrinsicAttack
}

/**
 * @param formNaturalAttack the active form's natural attack, or `null`.
 *
 * **Provisional param:** no MVP form-swap mechanic declares a natural attack yet,
 * so the form arm is fixture-only today. The first real form-swap follow-up
 * **replaces this param** with a `naturalAttack` component read off the formed
 * entity (+ the `applyForm` carry) — do not build a durable caller around the param.
 */
/**
 * The {@link AttackRollContext} a basic attack rolls under — "a weapon attack is
 * mechanically a Skill attack" (rulebook 3.3), so it presents as an `attack`-kind
 * context and the same filter/scaler machinery applies. The v2 twin of v1's
 * private `weaponAttackContext`; owned here so the rule stays with the basic
 * attack it describes rather than re-derived by each consumer.
 */
export function intrinsicAttackRollContext(
  attack: IntrinsicAttack
): AttackRollContext {
  return {
    kind: "attack",
    damageType: attack.damageType,
    delivery: attack.delivery,
    attribute: attack.attackRoll.attribute,
  }
}

export function resolveBasicAttack(
  deps: Pick<GameData, "getItem">,
  entity: Entity,
  formNaturalAttack: IntrinsicAttack | null
): ResolvedBasicAttack | null {
  if (formNaturalAttack) return { source: "form", attack: formNaturalAttack }

  const items = entity.components.equipment?.items ?? []
  const weapon = getEquippedItem(deps, items, "weapon")
  if (weapon) return { source: "weapon", attack: weapon.equip.intrinsicAttack }

  return null
}
