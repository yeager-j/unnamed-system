import { describe, expect, it } from "vitest"

import { banditCaptain } from "@workspace/game/data/enemies/5e/humanoid/bandit-captain"
import { makeHydratedCharacter } from "@workspace/game/engine/__fixtures__/character"
import {
  statblockFromCharacter,
  statblockFromEnemy,
} from "@workspace/game/engine/combatant/statblock"
import { type EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

describe("statblockFromCharacter", () => {
  it("projects the hydrated character's resolved fields and tags provenance", () => {
    const character = makeHydratedCharacter()
    const statblock = statblockFromCharacter(character)

    expect(statblock).toEqual({
      source: "character",
      name: character.name,
      level: character.level,
      attributes: character.attributes,
      maxHP: character.maxHP,
      affinities: character.affinityChart,
      skills: character.skills,
      talents: character.talents,
      weaponAttackRoll: character.weaponAttackRoll,
      abilities: null,
    })
  })
})

describe("statblockFromEnemy", () => {
  it("derives the catalog enemy's flat sheet, hydrated skills, and abilities", () => {
    const statblock = statblockFromEnemy(banditCaptain)

    expect(statblock.source).toBe("enemy")
    expect(statblock.name).toBe(banditCaptain.name)
    expect(statblock.level).toBe(banditCaptain.level)
    expect(statblock.maxHP).toBe(banditCaptain.maxHP)
    expect(statblock.attributes).toEqual(banditCaptain.attributes)
    expect(statblock.affinities).toEqual(banditCaptain.affinities)
    expect(statblock.talents).toEqual(banditCaptain.talents)
    expect(statblock.abilities).toBe(banditCaptain.abilities)
    expect(statblock.weaponAttackRoll).toBeNull()
  })

  it("hydrates one Skill per skillKey against the enemy's flat Attributes", () => {
    const statblock = statblockFromEnemy(banditCaptain)
    expect(statblock.skills).toHaveLength(banditCaptain.skillKeys.length)
    // garu / zio are attack Skills, so each resolves an Attack Roll off the
    // enemy's flat Attributes (the SkillCard reuse this whole ticket enabled).
    for (const skill of statblock.skills) {
      expect(skill.resolvedAttackRoll).not.toBeNull()
    }
  })

  it("carries null abilities and no skills for a bare stat block", () => {
    const bare: EnemyDefinition = {
      key: "test-dummy",
      level: 1,
      name: "Test Dummy",
      maxHP: 10,
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      affinities: {},
      skillKeys: [],
      talents: [],
    }
    const statblock = statblockFromEnemy(bare)

    expect(statblock.abilities).toBeNull()
    expect(statblock.skills).toEqual([])
  })
})
