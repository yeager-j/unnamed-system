import { describe, expect, it } from "vitest"

import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import type { MapZone } from "@workspace/game-v2/spatial"

import type { RailRow } from "@/domain/combat/view/roster-view"

import { combatZoneView, exploreZoneView } from "./set-piece-view"

const zone = (over: Partial<MapZone> = {}): MapZone =>
  ({
    id: "z1",
    name: "The Nave",
    description: "",
    dmNotes: "",
    position: { x: 0, y: 0 },
    ...over,
  }) as MapZone

const engaged = (...ids: string[]): Engagement =>
  ({ status: "engaged", targetCombatantIds: ids }) as Engagement

const row = (
  id: string,
  side: RailRow["side"],
  engagement: Engagement = { status: "free" }
): RailRow =>
  ({
    id,
    name: id.toUpperCase(),
    side,
    portraitUrl: null,
    isCurrent: false,
    hp: { current: 10, max: 10 },
    sp: { current: 5, max: 5 },
    engagement,
  }) as RailRow

describe("exploreZoneView — owned is 0..n from the array", () => {
  const tokens = [
    { characterId: "a", name: "A", portraitUrl: null },
    { characterId: "b", name: "B", portraitUrl: null },
    { characterId: "c", name: "C", portraitUrl: null },
  ]

  it("marks no token owned when the array is empty", () => {
    const view = exploreZoneView({ zone: zone(), revealed: true, tokens })
    expect(view.occupants.every((o) => !o.owned)).toBe(true)
  })

  it("marks several tokens owned when the viewer owns several", () => {
    const view = exploreZoneView({
      zone: zone(),
      revealed: true,
      tokens,
      ownedCharacterIds: ["a", "c"],
    })
    expect(view.occupants.filter((o) => o.owned).map((o) => o.key)).toEqual([
      "a",
      "c",
    ])
  })

  it("passes reveal through as 'unmapped' when unrevealed", () => {
    expect(
      exploreZoneView({ zone: zone(), revealed: false, tokens }).reveal
    ).toBe("unmapped")
  })
})

describe("combatZoneView — engagementGroup only for multi-member clusters", () => {
  it("assigns no group to a lone (Free) combatant", () => {
    const view = combatZoneView({
      zone: zone(),
      revealed: true,
      rows: [row("solo", "players")],
    })
    expect(view.occupants[0]!.engagementGroup).toBeUndefined()
  })

  it("assigns two disjoint melee pairs distinct group ids; frees stay ungrouped", () => {
    const view = combatZoneView({
      zone: zone(),
      revealed: true,
      rows: [
        row("p1", "players", engaged("e1")),
        row("e1", "enemies", engaged("p1")),
        row("p2", "players", engaged("e2")),
        row("e2", "enemies", engaged("p2")),
        row("free", "players"),
      ],
    })
    const groupOf = (key: string) =>
      view.occupants.find((o) => o.key === key)!.engagementGroup

    expect(groupOf("p1")).toBe(groupOf("e1"))
    expect(groupOf("p2")).toBe(groupOf("e2"))
    expect(groupOf("p1")).not.toBe(groupOf("p2"))
    expect(groupOf("free")).toBeUndefined()
  })

  it("summarizes both sides present as a combat teaser", () => {
    const view = combatZoneView({
      zone: zone(),
      revealed: true,
      rows: [row("p1", "players"), row("e1", "enemies"), row("e2", "enemies")],
    })
    expect(view.summary).toBe("Combat · 1 v 2")
  })
})
