import { describe, expect, it } from "vitest"

import type { CombatantSetup } from "./session"
import { buildSetupCombatantLabels } from "./setup-roster-view"

function catalogEnemy(enemyKey: string): CombatantSetup {
  return {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey },
    zoneId: "",
  }
}

function pc(characterId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId: "" }
}

describe("buildSetupCombatantLabels", () => {
  it("resolves catalog enemy names and numbers duplicates in roster order", () => {
    const labels = buildSetupCombatantLabels(
      [catalogEnemy("goblin"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      {}
    )
    expect(labels).toEqual(["Goblin", "Goblin 2", "Goblin 3"])
  })

  it("leaves a singleton un-numbered", () => {
    expect(buildSetupCombatantLabels([catalogEnemy("goblin")], {})).toEqual([
      "Goblin",
    ])
  })

  it("resolves PC names from the injected map and numbers per base name", () => {
    const labels = buildSetupCombatantLabels(
      [pc("char-1"), catalogEnemy("goblin"), catalogEnemy("goblin")],
      { "char-1": "Brannis" }
    )
    expect(labels).toEqual(["Brannis", "Goblin", "Goblin 2"])
  })

  it("falls back to the raw key when a catalog lookup misses", () => {
    expect(buildSetupCombatantLabels([catalogEnemy("nope")], {})).toEqual([
      "nope",
    ])
  })

  it("is index-aligned to the input", () => {
    const setups = [catalogEnemy("goblin"), pc("char-1")]
    expect(
      buildSetupCombatantLabels(setups, { "char-1": "Roan" })
    ).toHaveLength(setups.length)
  })
})
