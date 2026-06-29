import { describe, expect, it } from "vitest"

import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { Lineage } from "@workspace/game-v2/kernel/vocab/lineage"

import { makeScene } from "./__fixtures__/session"
import {
  derivePartyComposition,
  derivePartyCompositionBySide,
} from "./party-composition"

/** A resolved Archetypes read-unit carrying the given active Lineage (or none). */
function arch(activeLineage: Lineage | null): ResolvedEntity["components"] {
  return {
    archetypes: {
      active: activeLineage ? "fixture-key" : null,
      origin: null,
      savedArchetypeRanks: 0,
      activeLineage,
      roster: [],
    },
  }
}

describe("derivePartyComposition (R15 / PC-1 / CD9c — PC by capability, not kind)", () => {
  it("tallies participants on a side by their resolved active Lineage", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: arch("warrior") },
      { id: "p2", side: "players", resolved: arch("mage") },
      { id: "p3", side: "players", resolved: arch("warrior") },
    ])
    expect(derivePartyComposition(view, "players")).toEqual({
      warrior: 2,
      mage: 1,
    })
  })

  it("skips a participant that resolves no Archetypes read-unit (an enemy)", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: arch("thief") },
      { id: "e1", side: "players" }, // enemy: no resolved archetypes
    ])
    expect(derivePartyComposition(view, "players")).toEqual({
      thief: 1,
    })
  })

  it("skips a PC with no active Archetype (activeLineage null)", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: arch(null) },
    ])
    expect(derivePartyComposition(view, "players")).toEqual({})
  })

  it("counts a charmed PC on its current allegiance side", () => {
    const { view } = makeScene([
      { id: "charmed", side: "enemies", resolved: arch("knight") },
    ])
    expect(derivePartyComposition(view, "enemies")).toEqual({
      knight: 1,
    })
    expect(derivePartyComposition(view, "players")).toEqual({})
  })

  it("derivePartyCompositionBySide returns a composition for every side", () => {
    const { view } = makeScene([
      { id: "p1", side: "players", resolved: arch("healer") },
      { id: "e1", side: "enemies", resolved: arch("berserker") },
    ])
    expect(derivePartyCompositionBySide(view)).toEqual({
      players: { healer: 1 },
      enemies: { berserker: 1 },
    })
  })
})
