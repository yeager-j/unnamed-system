import { describe, expect, it } from "vitest"

import { ENEMIES, getEnemy } from "@workspace/game-v2/catalog/enemies"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"

describe("enemy catalog", () => {
  it("returns undefined for unknown keys", () => {
    expect(getEnemy("nope")).toBeUndefined()
  })

  it("indexes each registered template by its entity id", () => {
    const ids = ENEMIES.map((enemy) => enemy.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const enemy of ENEMIES) {
      expect(getEnemy(enemy.id)).toBe(enemy)
    }
  })

  it("validates every registered template through the load seam", () => {
    for (const enemy of ENEMIES) {
      const loaded = loadEntity(enemy.id, enemy.components)
      expect(loaded.ok, enemy.id).toBe(true)
    }
  })

  it("keeps registered templates flat and setup-only", () => {
    const forbidden = [
      "skillPool",
      "path",
      "archetypes",
      "equipment",
      "resources",
    ] as const

    for (const enemy of ENEMIES) {
      for (const component of forbidden) {
        expect(enemy.components[component], `${enemy.id}.${component}`).toBe(
          undefined
        )
      }
    }
  })
})
