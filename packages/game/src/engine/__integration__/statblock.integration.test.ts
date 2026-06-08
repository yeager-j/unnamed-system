import { describe, expect, it } from "vitest"

import { makeArchetype } from "@workspace/game/engine/__fixtures__/archetypes"
import {
  makeArchetypeRow,
  makeHydratedCharacter,
} from "@workspace/game/engine/__fixtures__/character"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  makeAttackSkill,
  makePassiveSkill,
} from "@workspace/game/engine/__fixtures__/skills"
import {
  resolveCatalogEnemyStatblocks,
  statblockFromCharacter,
  statblockFromEnemy,
} from "@workspace/game/engine/combatant/statblock"
import { type CombatantRef } from "@workspace/game/foundation/encounter/session"

/**
 * A synthetic catalog covering both provenance paths: a fixture Archetype (so a
 * hydrated PC has Skills + Talents to project), two attack Skills the enemy
 * hydrates, and two fixture enemies. Keys are opaque ids and the numbers are
 * assigned here, so the tests assert the *projection/derivation* behavior, never
 * a shipped creature's balance.
 */
const fxAttack = (key: string) =>
  makeAttackSkill({
    key,
    damageType: "wind",
    attackRoll: { attribute: "ma", tiers: [{ band: "1+", sideEffects: [] }] },
  })

const fxWarrior = makeArchetype({
  key: "warrior",
  lineage: "warrior",
  skills: [{ skill: "cleave", rank: 1 }],
  talents: ["climb"],
})

const fxEnemy = makeEnemy({
  key: "bandit-captain",
  name: "Bandit Captain",
  level: 3,
  maxHP: 30,
  attributes: { strength: 2, magic: 3, agility: 1, luck: 0 },
  affinities: { slash: "resist" },
  talents: ["climb"],
  skillKeys: ["garu", "zio"],
  abilities: "Multiattack: the captain makes two melee attacks.",
})
const goblin = makeEnemy({ key: "goblin", name: "Goblin", level: 1 })

const TEST_DATA = makeTestGameData({
  archetypes: [fxWarrior],
  skills: [
    makePassiveSkill({ key: "cleave" }),
    fxAttack("garu"),
    fxAttack("zio"),
  ],
  enemies: [fxEnemy, goblin],
})

describe("statblockFromCharacter", () => {
  it("projects the hydrated character's resolved fields and tags provenance", () => {
    const character = makeHydratedCharacter(
      {
        row: { activeArchetypeId: "a" },
        archetypeRows: [
          makeArchetypeRow({ id: "a", archetypeKey: "warrior", rank: 1 }),
        ],
      },
      TEST_DATA
    )
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
    // The fixture Archetype contributes Skills + Talents, so the projection is
    // exercised on non-empty collections rather than a trivial empty sheet.
    expect(statblock.skills.length).toBeGreaterThan(0)
    expect(statblock.talents).toContain("climb")
  })
})

describe("statblockFromEnemy", () => {
  it("derives the catalog enemy's flat sheet, hydrated skills, and abilities", () => {
    const statblock = statblockFromEnemy(fxEnemy, TEST_DATA)

    expect(statblock.source).toBe("enemy")
    expect(statblock.name).toBe(fxEnemy.name)
    expect(statblock.level).toBe(fxEnemy.level)
    expect(statblock.maxHP).toBe(fxEnemy.maxHP)
    expect(statblock.attributes).toEqual(fxEnemy.attributes)
    expect(statblock.affinities).toEqual(fxEnemy.affinities)
    expect(statblock.talents).toEqual(fxEnemy.talents)
    expect(statblock.abilities).toBe(fxEnemy.abilities)
    expect(statblock.weaponAttackRoll).toBeNull()
  })

  it("hydrates one Skill per skillKey against the enemy's flat Attributes", () => {
    const statblock = statblockFromEnemy(fxEnemy, TEST_DATA)
    expect(statblock.skills).toHaveLength(fxEnemy.skillKeys.length)
    // garu / zio are attack Skills, so each resolves an Attack Roll off the
    // enemy's flat Attributes.
    for (const skill of statblock.skills) {
      expect(skill.resolvedAttackRoll).not.toBeNull()
    }
  })

  it("carries null abilities and no skills for a bare stat block", () => {
    const bare = makeEnemy({ key: "test-dummy", name: "Test Dummy" })
    const statblock = statblockFromEnemy(bare, TEST_DATA)

    expect(statblock.abilities).toBeNull()
    expect(statblock.skills).toEqual([])
  })
})

describe("resolveCatalogEnemyStatblocks", () => {
  const ref = (r: CombatantRef) => ({ ref: r })

  it("resolves each catalog enemy once; skips pcs, inline enemies, and unknown keys", () => {
    const map = resolveCatalogEnemyStatblocks(
      [
        ref({ kind: "pc", characterId: "char-1" }),
        ref({ kind: "catalog-enemy", enemyKey: "goblin" }),
        ref({ kind: "catalog-enemy", enemyKey: "goblin" }),
        ref({ kind: "catalog-enemy", enemyKey: "not-a-real-enemy" }),
      ],
      TEST_DATA
    )

    // Only the resolvable catalog enemy lands in the map (pc / unknown excluded).
    expect(Object.keys(map)).toEqual(["goblin"])
    expect(map.goblin?.source).toBe("enemy")
    expect(map.goblin?.name).toBe("Goblin")
  })

  it("returns an empty map for a roster with no catalog enemies", () => {
    expect(resolveCatalogEnemyStatblocks([], TEST_DATA)).toEqual({})
  })
})
