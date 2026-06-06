import { describe, expect, it } from "vitest"

import { getEnemy } from "@workspace/game/data/enemies/registry"
import { buildEnemyDetailView } from "@workspace/game/engine/enemies/enemy-detail-view"
import { AFFINITY_DAMAGE_TYPES } from "@workspace/game/foundation/combat/affinity"

const goblin = getEnemy("goblin")!

describe("buildEnemyDetailView", () => {
  const view = buildEnemyDetailView(goblin)

  it("carries the catalog identity (no SP — there is no SP field)", () => {
    expect(view).toMatchObject({
      key: "goblin",
      name: "Goblin",
      family: "humanoid",
      level: 1,
      maxHP: 16,
    })
    expect("maxSP" in view).toBe(false)
  })

  it("expands the affinity chart to the full ordered grid", () => {
    expect(view.affinities.map((cell) => cell.damageType)).toEqual([
      ...AFFINITY_DAMAGE_TYPES,
    ])
  })

  it("resolves charted affinities and defaults the rest to neutral", () => {
    const byType = new Map(
      view.affinities.map((cell) => [cell.damageType, cell.affinity])
    )
    expect(byType.get("wind")).toBe("weak")
    expect(byType.get("dark")).toBe("resist")
    expect(byType.get("fire")).toBe("neutral")
  })

  it("resolves talent keys to display names", () => {
    expect(view.talents).toContainEqual({ key: "sneak", name: "Sneak" })
  })

  it("resolves skill keys to display names", () => {
    const withSkills = buildEnemyDetailView(getEnemy("shadow") ?? goblin)
    for (const skill of withSkills.skills) {
      expect(skill.name).not.toBe("")
    }
  })

  it("passes the abilities markdown through verbatim", () => {
    expect(view.abilities).toBe(goblin.abilities)
  })
})
