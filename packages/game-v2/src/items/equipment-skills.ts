import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The Skills granted by an entity's **equipped** items (`type: "skill"` effects),
 * resolved to their catalog Skills (unresolved keys dropped) — active and passive
 * alike. The equipment half of the skill **collection** (`resolve/collect-skills.ts`),
 * sibling to the archetype + inheritance + intrinsic halves.
 *
 * Both axes fall out of collecting the granted Skill here: a **castable** grant hydrates
 * into the skill list, and **any** grant's always-on `effects[]` fold into the resolve
 * pool (castability-independent) — the collection reads both off the one set, so neither
 * is special-cased here. The item-local `skill` effect is never itself a
 * `CombatantEffect`; its only job is to name the granted Skill.
 *
 * Equipment passes through a form fully (D22), so `collectSkills` hands this the
 * form-merged entity (the `equipment` component is untouched by `applyForm`).
 */
export function equipmentGrantedSkills(
  deps: Pick<GameData, "getEquippableItem" | "getSkill">,
  entity: Entity
): Skill[] {
  const items = entity.components.equipment?.items ?? []
  const granted: Skill[] = []

  for (const row of items) {
    if (!row.equipped) continue
    const item = deps.getEquippableItem(row.catalogItemKey)
    if (!item) continue

    for (const effect of item.equip.effects ?? []) {
      if (effect.type !== "skill") continue
      const skill = deps.getSkill(effect.skillKey)
      if (skill) granted.push(skill)
    }
  }

  return granted
}
