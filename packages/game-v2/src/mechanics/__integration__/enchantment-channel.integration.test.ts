import { describe, expect, it } from "vitest"

import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics/zone-enchantment"
import {
  makeDerivedEntity,
  makeTestGameData,
} from "@workspace/game-v2/progression/__fixtures__/derive"
import { createResolveEntity } from "@workspace/game-v2/resolve-entity"

/**
 * The Bard's engine-visible effect flows through the **zone channel**, not the
 * mechanic's `effects()`: `zoneEnchantmentEffects` → `resolveEntity`'s effects
 * context → `resolve`, which surfaces the Toccata attack-roll bonus in
 * `pendingEffects` for the PR7 attack-roll resolver. (The encounter PR supplies the
 * live `ZoneEnchantment` + the combatant's zone; here they're authored.)
 */
const resolveEntity = createResolveEntity(makeTestGameData())

describe("zone enchantment → resolve effects channel", () => {
  it("a combatant in the Enchanted Zone gets Toccata's attack-roll bonus in pendingEffects", () => {
    const enchantment = { zoneId: "z1", type: "toccata", forte: 2 } as const
    const resolved = resolveEntity(makeDerivedEntity({}), {
      effects: zoneEnchantmentEffects(enchantment, "z1"),
    })
    expect(resolved.components.pendingEffects?.attackRoll).toEqual([
      { type: "attackRoll", amount: 2, source: "Toccata" },
    ])
  })

  it("a combatant in a different Zone gets nothing", () => {
    const enchantment = { zoneId: "z1", type: "toccata", forte: 2 } as const
    const resolved = resolveEntity(makeDerivedEntity({}), {
      effects: zoneEnchantmentEffects(enchantment, "z2"),
    })
    expect(resolved.components.pendingEffects).toBeUndefined()
  })
})
