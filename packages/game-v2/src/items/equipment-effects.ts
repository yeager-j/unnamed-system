import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"

/**
 * The equipment slice's **direct** contribution to the resolve effects channel
 * (D19/D22): each **equipped** item's `affinity`/`attribute` effects, emitted as
 * authored. **Source labels pass through** (no synthetic stamp), so an unsourced
 * equipment effect resolves to the "Bonus" label exactly as in v1 (golden-master
 * parity).
 *
 * Granted Skills (`type: "skill"`) are **not** handled here — they are a *skills*
 * concern: `items/equipment-skills.ts` collects them so a granted passive's effects
 * and a granted active's castability are derived from the one skill collection
 * (`resolve/collect-skills.ts`), deduped against the other sources. The `skill`
 * effect is skipped here so it never leaks into the channel or double-counts.
 *
 * **Deliberate divergence from v1:** v1 only folded equipment effects when an
 * Archetype was active (`active ? activeSkillsFor(...) : []`). v2 reads `Equipment`
 * **unconditionally** — equipment is its own capability (D17/D36), independent of
 * `Archetypes`. So an Archetype-less entity with equipment now contributes (v1
 * returned empty). Pure, deps-curried, fixture-tested.
 */
export function equipmentEffects(
  deps: Pick<GameData, "getEquippableItem">,
  entity: Entity
): CombatantEffect[] {
  const items = entity.components.equipment?.items ?? []
  const effects: CombatantEffect[] = []

  for (const row of items) {
    if (!row.equipped) continue
    const item = deps.getEquippableItem(row.catalogItemKey)
    if (!item) continue

    for (const effect of item.equip.effects ?? []) {
      if (effect.type === "skill") continue
      effects.push(effect)
    }
  }

  return effects
}
