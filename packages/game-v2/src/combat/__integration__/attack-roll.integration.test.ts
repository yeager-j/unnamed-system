import { describe, expect, it } from "vitest"

import {
  resolveAttackRoll,
  type AttackRollContext,
} from "@workspace/game-v2/combat/attack-roll"
import { getEnchantment } from "@workspace/game-v2/mechanics/zone-enchantment"
import { createResolveEntity } from "@workspace/game-v2/resolve"
import {
  makeArchetype,
  makeDerivedEntity,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"

/**
 * The end-to-end channel: `resolveEntity` collects the active mechanic's + the
 * zone-enchantment's attack-roll effects into `pendingEffects` (in contributor
 * order — mechanic → context), and `resolveAttackRoll` folds them against an
 * attack context. Proves the PR4 producer and the PR7 consumer agree, and that
 * the contributor order (C6, as far as PR7 can exercise it) is preserved.
 */
const SLASH_ST: AttackRollContext = {
  kind: "attack",
  damageType: "slash",
  delivery: "physical",
  attribute: "st",
}

// A Warrior whose active Archetype owns Perfection, with a +2 base Strength.
const deps = makeTestGameData({
  warrior: makeArchetype({
    lineage: "warrior",
    mechanic: "perfection",
    attributes: { strength: 2, magic: 0, agility: 0, luck: 0 },
  }),
})
const resolveEntity = createResolveEntity(deps)

const toccataEffects = getEnchantment("toccata").effects(2)

describe("resolveEntity → pendingEffects → resolveAttackRoll", () => {
  it("folds mechanic + zone effects in order behind the rolling Attribute", () => {
    const entity = makeDerivedEntity({
      active: "warrior",
      mechanics: { perfection: { kind: "perfection", rank: 3 } },
    })
    const resolved = resolveEntity(entity, { effects: toccataEffects })

    expect(resolveAttackRoll(SLASH_ST, resolved, null)).toEqual({
      total: 7,
      sources: [
        { source: "Strength", amount: 2 },
        { source: "Perfection (A)", amount: 3 },
        { source: "Toccata", amount: 2 },
      ],
    })
  })

  it("a rank-0 Perfection contributes no source row (effects() emits nothing)", () => {
    const entity = makeDerivedEntity({
      active: "warrior",
      mechanics: { perfection: { kind: "perfection", rank: 0 } },
    })
    const resolved = resolveEntity(entity)

    expect(resolveAttackRoll(SLASH_ST, resolved, null)).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })
})
