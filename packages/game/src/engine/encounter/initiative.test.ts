import { describe, expect, it } from "vitest"

import { enemyStatblocks } from "@workspace/game/engine/__fixtures__/encounter"
import { compareInitiative } from "@workspace/game/engine/encounter/initiative"
import type { CombatantSetup } from "@workspace/game/foundation/encounter/session"

/** Binds the resolved enemy statblocks for the roster under test so the
 *  catalog-enemy case reads real attributes; non-catalog rosters get `{}`. */
const cmp = (
  combatants: Parameters<typeof compareInitiative>[0],
  pcStats: Parameters<typeof compareInitiative>[1]
) => compareInitiative(combatants, pcStats, enemyStatblocks(combatants))

function pc(characterId: string, side: "players" | "enemies"): CombatantSetup {
  return { side, ref: { kind: "pc", characterId }, zoneId: "z" }
}

function inlineEnemy(
  agility: number,
  luck: number,
  side: "players" | "enemies" = "enemies"
): CombatantSetup {
  return {
    side,
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Foe",
        maxHP: 10,
        currentHP: 10,
        maxSP: 0,
        currentSP: 0,
        attributes: { strength: 0, magic: 0, agility, luck },
      },
    },
    zoneId: "z",
  }
}

function catalogEnemy(enemyKey: string): CombatantSetup {
  return {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey },
    zoneId: "z",
  }
}

describe("compareInitiative", () => {
  it("suggests the side with the higher highest-Agility", () => {
    const result = cmp([pc("p1", "players"), inlineEnemy(3, 9)], {
      p1: { agility: 5, luck: 0 },
    })
    expect(result.players.highestAgility).toBe(5)
    expect(result.enemies.highestAgility).toBe(3)
    expect(result.suggested).toBe("players")
  })

  it("takes the highest Agility across a side's combatants", () => {
    const result = cmp(
      [pc("p1", "players"), pc("p2", "players"), inlineEnemy(4, 0)],
      { p1: { agility: 2, luck: 0 }, p2: { agility: 6, luck: 0 } }
    )
    expect(result.players.highestAgility).toBe(6)
    expect(result.suggested).toBe("players")
  })

  it("breaks an Agility tie on the highest Luck", () => {
    const result = cmp([pc("p1", "players"), inlineEnemy(4, 7)], {
      p1: { agility: 4, luck: 2 },
    })
    expect(result.suggested).toBe("enemies")
  })

  it("returns null when tied through Luck (DM's call)", () => {
    const result = cmp([pc("p1", "players"), inlineEnemy(4, 2)], {
      p1: { agility: 4, luck: 2 },
    })
    expect(result.suggested).toBeNull()
  })

  it("yields to the only populated side when the other is empty", () => {
    const result = cmp([pc("p1", "players"), pc("p2", "players")], {
      p1: { agility: 1, luck: 1 },
      p2: { agility: 2, luck: 2 },
    })
    expect(result.enemies.highestAgility).toBeNull()
    expect(result.suggested).toBe("players")
  })

  it("returns null when there are no combatants at all", () => {
    const result = cmp([], {})
    expect(result.suggested).toBeNull()
  })

  it("resolves a catalog enemy's attributes from its definition", () => {
    // goblin is a known catalog enemy; its Agility comes from the definition.
    const result = cmp([pc("p1", "players"), catalogEnemy("goblin")], {
      p1: { agility: 0, luck: 0 },
    })
    expect(result.enemies.highestAgility).not.toBeNull()
    expect(Number.isFinite(result.enemies.highestAgility)).toBe(true)
    expect(Number.isFinite(result.enemies.highestLuck)).toBe(true)
    expect(result.suggested).toBe("enemies")
  })

  it("takes the highest Luck (not the lowest) across a side when breaking an Agility tie", () => {
    const result = cmp(
      [pc("p1", "players"), pc("p2", "players"), inlineEnemy(4, 5)],
      { p1: { agility: 4, luck: 3 }, p2: { agility: 4, luck: 9 } }
    )
    expect(result.players.highestLuck).toBe(9)
    expect(result.suggested).toBe("players")
  })

  it("suggests players on a Luck tiebreak when their Luck is higher", () => {
    const result = cmp([pc("p1", "players"), inlineEnemy(4, 1)], {
      p1: { agility: 4, luck: 6 },
    })
    expect(result.suggested).toBe("players")
  })

  it("yields to a non-positive-Agility populated side when the other is empty", () => {
    const result = cmp([pc("p1", "players")], {
      p1: { agility: 0, luck: 0 },
    })
    expect(result.enemies.highestAgility).toBeNull()
    expect(result.suggested).toBe("players")
  })

  it("yields to the enemies even when their only Agility is negative", () => {
    const result = cmp([inlineEnemy(-1, 0)], {})
    expect(result.players.highestAgility).toBeNull()
    expect(result.suggested).toBe("enemies")
  })

  it("ignores a PC whose stats weren't supplied", () => {
    const result = cmp([pc("missing", "players"), inlineEnemy(3, 3)], {})
    expect(result.players.highestAgility).toBeNull()
    expect(result.suggested).toBe("enemies")
  })
})
