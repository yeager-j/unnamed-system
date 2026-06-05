import { describe, expect, it } from "vitest"

import {
  findUnregisteredEntries,
  loadCatalogEntryModules,
} from "../catalog/registered-entries"
import { getSkill } from "../skills/index"
import { goblin } from "./5e/humanoid/goblin"
import { ENEMIES, getEnemy } from "./index"
import { enemyDefinitionSchema } from "./schema"

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

  it("registers every entry file on disk", async () => {
    const modules = await loadCatalogEntryModules(import.meta.dirname)
    expect(findUnregisteredEntries(modules, getEnemy)).toEqual([])
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
