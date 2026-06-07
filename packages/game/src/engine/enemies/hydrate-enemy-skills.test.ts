import { describe, expect, it } from "vitest"

import { banditCaptain } from "@workspace/game/data/enemies/5e/humanoid/bandit-captain"
import { gameData } from "@workspace/game/data/game-data"
import { hydrateEnemySkills } from "@workspace/game/engine/enemies/hydrate-enemy-skills"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

describe("hydrateEnemySkills", () => {
  it("resolves an attack Skill's Attack Roll against the enemy's flat Attributes", () => {
    // garu / zio roll Magic; the Bandit Captain has none of the Archetype
    // machinery, so the total is just its flat Magic with a single source.
    const garu = hydrateEnemySkills(banditCaptain, gameData).find(
      (s) => s.key === "garu"
    )
    expect(garu?.resolvedAttackRoll?.total).toBe(banditCaptain.attributes.magic)
    expect(garu?.resolvedAttackRoll?.sources).toHaveLength(1)
  })

  it("folds an enemy's own passive Attack-Roll effect into the total", () => {
    const enemy = {
      key: "test-brute",
      level: 3,
      name: "Test Brute",
      maxHP: 40,
      attributes: { strength: 3, magic: 0, agility: 0, luck: 0 },
      affinities: {},
      skillKeys: ["cleave", "slash-boost"],
      talents: [],
    } satisfies EnemyDefinition

    const cleave = hydrateEnemySkills(enemy, gameData).find(
      (s) => s.key === "cleave"
    )
    // Strength 3 + Slash Boost +2 (cleave deals slash damage).
    expect(cleave?.resolvedAttackRoll?.total).toBe(5)
    expect(cleave?.resolvedAttackRoll?.sources).toContainEqual({
      source: "Slash Boost",
      amount: 2,
    })
  })

  it("leaves a non-attacking Skill with no Attack Roll", () => {
    const enemy = {
      key: "test-caster",
      level: 1,
      name: "Test Caster",
      maxHP: 20,
      attributes: { strength: 0, magic: 2, agility: 0, luck: 0 },
      affinities: {},
      skillKeys: ["slash-boost"],
      talents: [],
    } satisfies EnemyDefinition

    const passive = hydrateEnemySkills(enemy, gameData).find(
      (s) => s.key === "slash-boost"
    )
    expect(passive?.resolvedAttackRoll).toBeNull()
  })

  it("drops a skillKey the lookup can't resolve", () => {
    // Validated catalog keys always resolve at runtime; a stubbed lookup that
    // misses exercises the skill-missing branch the real catalog never hits.
    expect(
      hydrateEnemySkills(banditCaptain, { getSkill: () => undefined })
    ).toEqual([])
  })
})
