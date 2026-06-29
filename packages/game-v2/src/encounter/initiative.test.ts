import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { makeScene } from "./__fixtures__/session"
import { compareInitiative } from "./initiative"

/** Resolved Attributes read-unit carrying only the two initiative inputs. */
function attrs(agility: number, luck: number): ResolvedEntity["components"] {
  return { attributes: { strength: 0, magic: 0, agility, luck } }
}

describe("compareInitiative (R3 / CD9a — uniform resolve, no kind branch)", () => {
  it("takes each side's highest Agility and highest Luck independently", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(5, 1) },
      { id: "p2", side: "players", resolved: attrs(2, 9) },
      { id: "e1", side: "enemies", resolved: attrs(3, 3) },
    ])

    const comparison = compareInitiative(view)

    expect(comparison.players).toEqual({ highestAgility: 5, highestLuck: 9 })
    expect(comparison.enemies).toEqual({ highestAgility: 3, highestLuck: 3 })
    expect(comparison.suggested).toBe("players")
  })

  it("yields null highs for a side with no participants", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(4, 4) },
    ])
    const comparison = compareInitiative(view)
    expect(comparison.enemies).toEqual({
      highestAgility: null,
      highestLuck: null,
    })
  })

  it("a non-empty side beats an empty opposing side", () => {
    const { view } = makeScene([
      { id: "e1", side: "enemies", resolved: attrs(1, 1) },
    ])
    expect(compareInitiative(view).suggested).toBe("enemies")
  })

  it("negative Agility still beats an empty opposing side", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(-3, -3) },
    ])
    expect(compareInitiative(view).suggested).toBe("players")
  })

  it("breaks an Agility tie on the higher Luck", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(4, 2) },
      { id: "e1", side: "enemies", resolved: attrs(4, 6) },
    ])
    expect(compareInitiative(view).suggested).toBe("enemies")
  })

  it("leads on Agility even while trailing on Luck (Luck only breaks an Agility tie)", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(6, 0) },
      { id: "e1", side: "enemies", resolved: attrs(2, 9) },
    ])
    expect(compareInitiative(view).suggested).toBe("players")
  })

  it("returns null for a true tie through Luck (the DM-d20 case)", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(4, 4) },
      { id: "e1", side: "enemies", resolved: attrs(4, 4) },
    ])
    expect(compareInitiative(view).suggested).toBeNull()
  })

  it("returns null when both sides are empty", () => {
    const { view } = makeScene([])
    expect(compareInitiative(view)).toEqual({
      players: { highestAgility: null, highestLuck: null },
      enemies: { highestAgility: null, highestLuck: null },
      suggested: null,
    })
  })

  it("ignores a participant that resolves no Attributes read-unit", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: attrs(7, 7) },
      { id: "p2", side: "players" }, // no resolved attributes → ignored
    ])
    const comparison = compareInitiative(view)
    expect(comparison.players).toEqual({ highestAgility: 7, highestLuck: 7 })
  })

  it("filters by the allegiance overlay side, not a fixed entity side", () => {
    const { view } = makeScene([
      { id: "charmed", side: "enemies", resolved: attrs(8, 8) },
    ])
    const comparison = compareInitiative(view)
    expect(comparison.enemies.highestAgility).toBe(8)
    expect(comparison.players.highestAgility).toBeNull()
  })
})
