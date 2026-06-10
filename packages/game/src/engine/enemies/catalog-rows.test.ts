import { describe, expect, it } from "vitest"

import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  buildEnemyCatalogRows,
  enemyFamilyCounts,
  filterEnemyCatalogRows,
  groupEnemyRowsByLevel,
} from "@workspace/game/engine/enemies/catalog-rows"
import { type EnemyFamily } from "@workspace/game/foundation/enemies/schema"

/**
 * A synthetic enemy catalog across families and levels. Keys/names are opaque
 * ids and the affinity charts are *assigned here*, so every assertion proves the
 * row-projection/filter/group *behavior* against fixtures — never a shipped
 * creature's balance. Seeded in a deliberately unsorted order so the level + name
 * sorts are observable. The `family` lives in a separate map (the real registry
 * derives it from directory structure, not a field on the definition).
 */
const goblin = makeEnemy({
  key: "goblin",
  name: "Goblin",
  level: 1,
  maxHP: 16,
  affinities: { wind: "weak", dark: "resist" },
})
const skeleton = makeEnemy({
  key: "skeleton",
  name: "Skeleton",
  level: 1,
  maxHP: 12,
  affinities: { strike: "weak" },
})
const direWolf = makeEnemy({
  key: "dire-wolf",
  name: "Dire Wolf",
  level: 2,
  maxHP: 22,
  affinities: { fire: "weak" },
})
const banditCaptain = makeEnemy({
  key: "bandit-captain",
  name: "Bandit Captain",
  level: 3,
  maxHP: 30,
  affinities: { slash: "resist", fire: "resist" },
})

// Skeleton precedes Goblin here even though both are Level 1, so the build
// order within that level is the reverse of name order — the within-level
// `.sort()` is then observable (a dropped sort leaves Skeleton ahead of Goblin).
const FIXTURE_ENEMIES = [direWolf, skeleton, banditCaptain, goblin]
const FIXTURE_FAMILIES: Record<string, EnemyFamily> = {
  goblin: "humanoid",
  skeleton: "undead",
  "dire-wolf": "beast",
  "bandit-captain": "humanoid",
}

const TEST_DATA = makeTestGameData({
  enemies: FIXTURE_ENEMIES,
  enemyFamilies: FIXTURE_FAMILIES,
})

describe("buildEnemyCatalogRows", () => {
  const rows = buildEnemyCatalogRows(TEST_DATA)()

  it("builds one row per catalog enemy", () => {
    expect(rows).toHaveLength(FIXTURE_ENEMIES.length)
  })

  it("projects the display fields and weakness of an enemy", () => {
    const row = rows.find((r) => r.key === "goblin")
    expect(row).toMatchObject({
      key: "goblin",
      name: "Goblin",
      family: "humanoid",
      level: 1,
      maxHP: 16,
    })
    expect(row?.weaknesses).toContain("wind")
  })

  it("resolves a family for every row", () => {
    expect(rows.every((row) => row.family)).toBe(true)
  })

  it("lists only Weak affinities as weaknesses (Resist excluded)", () => {
    const captain = rows.find((row) => row.key === "bandit-captain")
    expect(captain?.weaknesses).toEqual([])
    // Goblin is Weak to Wind only — Dark is Resist, not a weakness.
    const goblinRow = rows.find((row) => row.key === "goblin")
    expect(goblinRow?.weaknesses).toEqual(["wind"])
  })
})

describe("filterEnemyCatalogRows", () => {
  const rows = buildEnemyCatalogRows(TEST_DATA)()

  it("matches a case-insensitive name substring", () => {
    const matched = filterEnemyCatalogRows(rows, {
      search: "GOB",
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
    const groups = groupEnemyRowsByLevel(buildEnemyCatalogRows(TEST_DATA)())

    const levels = groups.map((group) => group.level)
    expect(levels).toEqual([...levels].sort((a, b) => a - b))

    for (const group of groups) {
      const names = group.rows.map((row) => row.name)
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
      expect(group.rows.every((row) => row.level === group.level)).toBe(true)
    }
  })

  it("preserves every row and places it in its level group", () => {
    const rows = buildEnemyCatalogRows(TEST_DATA)()
    const groups = groupEnemyRowsByLevel(rows)
    expect(groups.flatMap((group) => group.rows)).toHaveLength(rows.length)
    // Both Goblin and Skeleton are Level 1; the group sorts them by name.
    const level1 = groups.find((group) => group.level === 1)
    expect(level1?.rows.map((row) => row.name)).toEqual(["Goblin", "Skeleton"])
  })
})

describe("enemyFamilyCounts", () => {
  it("counts rows per family, totalling the catalog", () => {
    const rows = buildEnemyCatalogRows(TEST_DATA)()
    const counts = enemyFamilyCounts(rows)
    const total = Object.values(counts).reduce<number>(
      (sum, n) => sum + (n ?? 0),
      0
    )
    expect(total).toBe(rows.length)
    // Goblin + Bandit Captain are both humanoid.
    expect(counts.humanoid).toBe(2)
  })
})
