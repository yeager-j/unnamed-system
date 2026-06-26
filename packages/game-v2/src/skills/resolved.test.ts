import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { resolveSkill } from "@workspace/game-v2/skills/resolved"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "attack",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

/** A plain combatant — attributes + vitals, NO `archetypes` component (an enemy/NPC). */
const enemy: ResolvedEntity = {
  id: "goblin",
  components: {
    attributes: { strength: 4, magic: 0, agility: 0, luck: 0 },
    vitals: { maxHP: 50, currentHP: 50 },
  },
}

describe("resolveSkill (entity-agnostic — no archetype required)", () => {
  it("resolves cost + Attack Roll for an archetype-less entity", () => {
    const slash = skill({
      key: "slash",
      cost: { kind: "sp", amount: 4 },
      attackRoll: { attribute: "st", tiers: [] },
      damage: { damageType: "slash", delivery: "physical" },
    })

    const resolved = resolveSkill(slash, enemy, null)

    expect(resolved.resolvedCost).toEqual({ kind: "sp", amount: 4 })
    expect(resolved.resolvedAttackRoll?.total).toBe(4) // strength 4, no effects
    expect(resolved.resolvedDamageBonuses).toEqual([])
  })

  it("resolves an hp-percent cost against the entity's maxHP", () => {
    const bite = skill({
      key: "bite",
      cost: { kind: "hp-percent", amount: 10 },
    })
    // 10% of maxHP 50 = 5
    expect(resolveSkill(bite, enemy, null).resolvedCost).toEqual({
      kind: "hp",
      amount: 5,
    })
  })

  it("a non-rolling Skill carries no Attack Roll", () => {
    const ward = skill({ key: "ward", kind: "passive" })
    const resolved = resolveSkill(ward, enemy, null)
    expect(resolved.resolvedAttackRoll).toBeNull()
    expect(resolved.resolvedDamageBonuses).toEqual([])
  })
})
