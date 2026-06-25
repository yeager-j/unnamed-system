import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { isPassive } from "@workspace/game-v2/skills/skill.schema"

/**
 * The equipment slice's contribution to the resolve effects channel (D19/D22). For
 * each **equipped** item, its `equip.effects[]` partition into:
 *
 * - `affinity`/`attribute` → emitted **directly** (already `CombatantEffect`s).
 * - `skill` (a grant reference) → resolve via `getSkill`; if the granted skill is
 *   **passive**, emit the granted skill's **own** `effects[]` (affinity/attribute/
 *   attackRoll — v1 parity: a passive folds all its effect kinds, not just
 *   attackRoll). An **active** grant contributes nothing here (it becomes castable —
 *   a skills concern, not a resolve contribution).
 *
 * The item-local `skill` effect is **never itself emitted** into the channel (it is
 * not a `CombatantEffect`) — the partition keeps it from leaking or being
 * double-counted. **Source labels pass through as authored** (no synthetic stamp),
 * so an unsourced equipment effect resolves to the "Bonus" label exactly as in v1
 * (golden-master parity).
 *
 * **Deliberate divergence from v1:** v1 only folded equipment-granted passive
 * effects when an Archetype was active (`active ? activeSkillsFor(...) : []`). v2
 * reads `Equipment` **unconditionally** — equipment is its own capability (D17/D36),
 * independent of `Archetypes`. So an Archetype-less entity with equipment now
 * contributes (v1 returned empty). Pure, deps-curried, fixture-tested.
 */
export function equipmentEffects(
  deps: Pick<GameData, "getEquippableItem" | "getSkill">,
  entity: Entity
): CombatantEffect[] {
  const items = entity.components.equipment?.items ?? []
  const effects: CombatantEffect[] = []

  for (const row of items) {
    if (!row.equipped) continue
    const item = deps.getEquippableItem(row.catalogItemKey)
    if (!item) continue

    for (const effect of item.equip.effects ?? []) {
      if (effect.type !== "skill") {
        effects.push(effect)
        continue
      }
      const granted = deps.getSkill(effect.skillKey)
      if (granted && isPassive(granted) && granted.effects) {
        effects.push(...granted.effects)
      }
    }
  }

  return effects
}
