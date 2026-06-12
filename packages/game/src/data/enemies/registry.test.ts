import { describe, expect, it } from "vitest"

import {
  findUnregisteredEntries,
  loadCatalogEntryModules,
} from "@workspace/game/data/catalog/registered-entries"
import { goblin } from "@workspace/game/data/enemies/5e/humanoid/goblin"
import {
  ENEMIES,
  getEnemy,
  getEnemyFamily,
  validateEnemy,
} from "@workspace/game/data/enemies/registry"
import { getSkill } from "@workspace/game/data/skills/registry"
import {
  ENEMY_FAMILIES,
  enemyDefinitionSchema,
  type EnemyDefinition,
} from "@workspace/game/foundation/enemies/schema"

describe("enemy catalog data", () => {
  it("has a unique, slug-shaped key for every enemy", () => {
    const keys = ENEMIES.map((enemy) => enemy.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("structurally parses every catalog entry", () => {
    for (const enemy of ENEMIES) {
      expect(() => enemyDefinitionSchema.parse(enemy)).not.toThrow()
    }
  })

  it("resolves every catalog enemy by its own key", () => {
    for (const enemy of ENEMIES) {
      expect(getEnemy(enemy.key)).toBe(enemy)
    }
  })

  it("resolves every referenced skillKey to a real Skill", () => {
    for (const enemy of ENEMIES) {
      for (const skillKey of enemy.skillKeys) {
        expect(getSkill(skillKey)).toBeDefined()
      }
    }
  })

  it("has no duplicate skill key across skillKeys + inlineSkills", () => {
    for (const enemy of ENEMIES) {
      const keys = [
        ...enemy.skillKeys,
        ...(enemy.inlineSkills ?? []).map((skill) => skill.key),
      ]
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it("resolves a known family for every enemy", () => {
    for (const enemy of ENEMIES) {
      const family = getEnemyFamily(enemy.key)
      expect(family).toBeDefined()
      expect(ENEMY_FAMILIES).toContain(family)
    }
  })

  it("registers every entry file on disk", async () => {
    const modules = await loadCatalogEntryModules(import.meta.dirname)
    expect(findUnregisteredEntries(modules, getEnemy)).toEqual([])
  })
})

describe("validateEnemy", () => {
  it("throws when an inlineSkill key collides with a referenced skillKey", () => {
    // "garu" resolves (so it clears the unknown-skill check), then the inline
    // Skill reuses that key — the collision the duplicate guard must catch. A
    // shipped-data invariant alone wouldn't prove the guard's `.find()` throws.
    const colliding: EnemyDefinition = {
      key: "test-colliding",
      level: 1,
      name: "Test Colliding",
      maxHP: 10,
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
      affinities: {},
      skillKeys: ["garu"],
      inlineSkills: [
        {
          kind: "passive",
          key: "garu",
          name: "Collision",
          tagline: "Collides with the referenced garu.",
          description: "Collides with the referenced garu.",
          isSynthesis: false,
        },
      ],
      talents: [],
    }

    expect(() => validateEnemy(colliding)).toThrow(/duplicate skill key "garu"/)
  })
})

describe("getEnemy", () => {
  it("returns the matching enemy by key", () => {
    expect(getEnemy("goblin")).toBe(goblin)
  })

  it("returns undefined for an unknown key", () => {
    expect(getEnemy("nope")).toBeUndefined()
  })
})

describe("Goblin transcription", () => {
  it("matches the Goblin snapshot end-to-end", () => {
    expect(enemyDefinitionSchema.parse(goblin)).toMatchSnapshot()
  })
})
