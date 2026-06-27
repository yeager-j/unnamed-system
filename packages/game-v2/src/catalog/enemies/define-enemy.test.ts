import { describe, expect, it } from "vitest"

import { defineEnemy } from "@workspace/game-v2/catalog/enemies/define-enemy"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

const fixtureSkill = {
  kind: "passive",
  key: "watchful",
  name: "Watchful",
  tagline: "Keeps watch.",
  description: "Keeps watch.",
  isSynthesis: false,
} satisfies Skill

describe("defineEnemy", () => {
  it("maps a fixture template into a loadable flat entity", () => {
    const enemy = defineEnemy({
      key: "fixture-enemy",
      name: "Fixture Enemy",
      level: 3,
      maxHP: 28,
      attributes: { strength: 1, magic: -1, agility: 2, luck: 0 },
      affinities: { fire: "weak", ice: "resist" },
      skillKeys: ["agi"],
      inlineSkills: [fixtureSkill],
      talents: ["sneak"],
    })

    expect(enemy).toEqual({
      id: "fixture-enemy",
      components: {
        identity: { name: "Fixture Enemy" },
        level: { value: 3 },
        attributes: { base: { strength: 1, magic: -1, agility: 2, luck: 0 } },
        affinities: { base: { fire: "weak", ice: "resist" } },
        vitals: { base: 28, damage: 0 },
        skills: [
          { kind: "ref", key: "agi" },
          { kind: "inline", skill: fixtureSkill },
        ],
        talents: [{ key: "sneak" }],
      },
    })

    expect(loadEntity(enemy.id, enemy.components).ok).toBe(true)
  })

  it("defaults omitted direct skills and talents to empty components", () => {
    const enemy = defineEnemy({
      key: "fixture-bare",
      name: "Fixture Bare",
      level: 1,
      maxHP: 1,
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      affinities: {},
    })

    expect(enemy.components.skills).toEqual([])
    expect(enemy.components.talents).toEqual([])
  })

  it("throws when a fixture does not satisfy the entity load seam", () => {
    expect(() =>
      defineEnemy({
        key: "fixture-invalid",
        name: "Fixture Invalid",
        level: 31,
        maxHP: 1,
        attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
        affinities: {},
      })
    ).toThrow('Invalid enemy template "fixture-invalid"')
  })
})
