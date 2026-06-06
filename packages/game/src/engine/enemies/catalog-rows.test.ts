import { describe, expect, it } from "vitest"

import { ENEMIES } from "@workspace/game/data/enemies/registry"
import {
  buildEnemyCatalogRows,
  enemyFamilyCounts,
  filterEnemyCatalogRows,
  groupEnemyRowsByLevel,
} from "@workspace/game/engine/enemies/catalog-rows"

describe("buildEnemyCatalogRows", () => {
  const rows = buildEnemyCatalogRows()

  it("builds one row per catalog enemy", () => {
    expect(rows).toHaveLength(ENEMIES.length)
  })

  it("projects the Goblin's display fields and weakness", () => {
    const goblin = rows.find((row) => row.key === "goblin")
    expect(goblin).toMatchObject({
      key: "goblin",
      name: "Goblin",
      family: "humanoid",
      level: 1,
      maxHP: 16,
    })
    expect(goblin?.weaknesses).toContain("wind")
  })

  it("resolves a family for every row", () => {
    expect(rows.every((row) => row.family)).toBe(true)
  })
})

describe("filterEnemyCatalogRows", () => {
  const rows = buildEnemyCatalogRows()

  it("matches a case-insensitive name substring", () => {
    const matched = filterEnemyCatalogRows(rows, {
      search: "gob",
      family: null,
    })
    expect(matched.length).toBeGreaterThan(0)
    expect(matched.every((row) => row.name.toLowerCase().includes("gob"))).toBe(
      true
    )
  })

  it("filters to a single family", () => {
    const beasts = filterEnemyCatalogRows(rows, { search: "", family: "beast" })
    expect(beasts.length).toBeGreaterThan(0)
    expect(beasts.every((row) => row.family === "beast")).toBe(true)
  })

  it("combines search and family", () => {
    const matched = filterEnemyCatalogRows(rows, {
      search: "goblin",
      family: "beast",
    })
    expect(matched).toEqual([])
  })

  it("returns all rows for an empty filter", () => {
    expect(
      filterEnemyCatalogRows(rows, { search: "  ", family: null })
    ).toEqual(rows)
  })
})

describe("groupEnemyRowsByLevel", () => {
  it("groups rows by ascending level, names sorted within a group", () => {
    const groups = groupEnemyRowsByLevel(buildEnemyCatalogRows())

    const levels = groups.map((group) => group.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))

    for (const group of groups) {
      const names = group.rows.map((row) => row.name)
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
      expect(group.rows.every((row) => row.level === group.level)).toBe(true)
    }
  })
})

describe("enemyFamilyCounts", () => {
  it("counts rows per family, totalling the catalog", () => {
    const rows = buildEnemyCatalogRows()
    const counts = enemyFamilyCounts(rows)
    const total = Object.values(counts).reduce<number>(
      (sum, n) => sum + (n ?? 0),
      0
    )
    expect(total).toBe(rows.length)
    expect(counts.humanoid).toBeGreaterThan(0)
  })
})
