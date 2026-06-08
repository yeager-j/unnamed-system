import { describe, expect, it } from "vitest"

import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill,
  makePassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import { hydrateEnemySkills } from "@workspace/game/engine/enemies/hydrate-enemy-skills"

/**
 * Fixture Skills that exercise the (engine-owned, real) Attack-Roll resolver:
 * an attack Skill rolling Magic, an attack Skill rolling Strength + slash damage,
 * and a passive carrying a slash-filtered Attack-Roll bonus. Keys are opaque ids
 * and the rolls/effects are *assigned here*, so the tests assert folding behavior
 * against the enemy's flat Attributes — never a shipped Skill's balance.
 */
const garu = makeAttackSkill({
  key: "garu",
  damageType: "wind",
  attackRoll: { attribute: "ma", tiers: [{ band: "1+", sideEffects: [] }] },
})
const cleave = makeAttackSkill({
  key: "cleave",
  damageType: "slash",
  attackRoll: { attribute: "st", tiers: [{ band: "1+", sideEffects: [] }] },
})
const slashBoost = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
  effects: [
    {
      type: "attackRoll",
      when: { damageTypes: ["slash"] },
      amount: 2,
      source: "Slash Boost",
    },
  ],
})

const TEST_DATA = makeTestGameData({ skills: [garu, cleave, slashBoost] })

describe("hydrateEnemySkills", () => {
  it("resolves an attack Skill's Attack Roll against the enemy's flat Attributes", () => {
    // garu rolls Magic; a flat stat block has no Archetype machinery, so the
    // total is just its flat Magic with a single source.
    const enemy = makeEnemy({
      attributes: { strength: 0, magic: 4, agility: 0, luck: 0 },
      skillKeys: ["garu"],
    })

    const resolved = hydrateEnemySkills(enemy, TEST_DATA).find(
      (s) => s.key === "garu"
    )
    expect(resolved?.resolvedAttackRoll?.total).toBe(enemy.attributes.magic)
    expect(resolved?.resolvedAttackRoll?.sources).toHaveLength(1)
  })

  it("folds an enemy's own passive Attack-Roll effect into the total", () => {
    const enemy = makeEnemy({
      name: "Test Brute",
      level: 3,
      maxHP: 40,
      attributes: { strength: 3, magic: 0, agility: 0, luck: 0 },
      skillKeys: ["cleave", "slash-boost"],
    })

    const resolved = hydrateEnemySkills(enemy, TEST_DATA).find(
      (s) => s.key === "cleave"
    )
    // Strength 3 + Slash Boost +2 (cleave deals slash damage).
    expect(resolved?.resolvedAttackRoll?.total).toBe(5)
    expect(resolved?.resolvedAttackRoll?.sources).toContainEqual({
      source: "Slash Boost",
      amount: 2,
    })
  })

  it("does not fold a passive bonus whose filter the Skill misses", () => {
    // Slash Boost filters to slash; garu deals wind, so the bonus must not apply
    // — total is just the rolling Attribute, pinning the damage-type filter.
    const enemy = makeEnemy({
      attributes: { strength: 0, magic: 4, agility: 0, luck: 0 },
      skillKeys: ["garu", "slash-boost"],
    })

    const resolved = hydrateEnemySkills(enemy, TEST_DATA).find(
      (s) => s.key === "garu"
    )
    expect(resolved?.resolvedAttackRoll?.total).toBe(enemy.attributes.magic)
    expect(resolved?.resolvedAttackRoll?.sources).toHaveLength(1)
  })

  it("leaves a non-attacking Skill with no Attack Roll", () => {
    const enemy = makeEnemy({
      attributes: { strength: 0, magic: 2, agility: 0, luck: 0 },
      skillKeys: ["slash-boost"],
    })

    const passive = hydrateEnemySkills(enemy, TEST_DATA).find(
      (s) => s.key === "slash-boost"
    )
    expect(passive?.resolvedAttackRoll).toBeNull()
  })

  it("drops a skillKey the lookup can't resolve", () => {
    // Validated catalog keys always resolve at runtime; a stubbed lookup that
    // misses exercises the skill-missing branch the real catalog never hits.
    const enemy = makeEnemy({ skillKeys: ["garu", "cleave"] })
    expect(hydrateEnemySkills(enemy, { getSkill: () => undefined })).toEqual([])
  })
})
