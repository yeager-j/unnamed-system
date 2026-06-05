import { describe, expect, it } from "vitest"

import { DEFAULT_BATTLE_CONDITIONS } from "@/lib/game/character"

import type {
  EncounterSnapshot,
  PlayerVisibleCombatant,
} from "./player-snapshot"
import { activeConditions, resolvePlayerView } from "./resolve-player-view"

function enemy(id: string, zoneId: string): PlayerVisibleCombatant {
  return {
    id,
    name: id,
    side: "enemies",
    zoneId,
    hasActed: false,
    isCurrent: false,
    ailments: [],
    battleConditions: { ...DEFAULT_BATTLE_CONDITIONS },
    engagedWith: [],
    kind: "enemy",
    hp: { current: 10, max: 10 },
    sp: null,
  }
}

function snapshot(
  combatants: PlayerVisibleCombatant[],
  zones: EncounterSnapshot["zones"]
): EncounterSnapshot {
  return {
    status: "live",
    name: "Test",
    round: 1,
    currentActor: null,
    combatants,
    zones,
  }
}

describe("resolvePlayerView", () => {
  it("groups combatants under their zone, in zone order", () => {
    const view = resolvePlayerView(
      snapshot(
        [enemy("a", "z2"), enemy("b", "z1"), enemy("c", "z1")],
        [
          { id: "z1", name: "Bridge" },
          { id: "z2", name: "Riverbank" },
        ]
      )
    )

    expect(view.hasZones).toBe(true)
    expect(view.zones.map((g) => g.zone.id)).toEqual(["z1", "z2"])
    expect(view.zones[0]!.combatants.map((c) => c.id)).toEqual(["b", "c"])
    expect(view.zones[1]!.combatants.map((c) => c.id)).toEqual(["a"])
    expect(view.unplaced).toEqual([])
  })

  it("buckets combatants with no matching zone into unplaced", () => {
    const view = resolvePlayerView(
      snapshot(
        [enemy("a", "z1"), enemy("b", ""), enemy("c", "stale")],
        [{ id: "z1", name: "Bridge" }]
      )
    )

    expect(view.zones[0]!.combatants.map((c) => c.id)).toEqual(["a"])
    expect(view.unplaced.map((c) => c.id)).toEqual(["b", "c"])
  })

  it("reports no zones for an unzoned encounter", () => {
    const view = resolvePlayerView(
      snapshot([enemy("a", ""), enemy("b", "")], [])
    )

    expect(view.hasZones).toBe(false)
    expect(view.zones).toEqual([])
    expect(view.unplaced.map((c) => c.id)).toEqual(["a", "b"])
  })
})

describe("activeConditions", () => {
  it("returns nothing when every axis is neutral and no flag is set", () => {
    expect(activeConditions(DEFAULT_BATTLE_CONDITIONS)).toEqual([])
  })

  it("surfaces non-neutral axes and set flags, dropping the rest", () => {
    expect(
      activeConditions({
        attack: "increased",
        defense: "decreased",
        hitEvasion: "neutral",
        charged: true,
        concentrating: false,
      })
    ).toEqual([
      { kind: "axis", axis: "attack", state: "increased" },
      { kind: "axis", axis: "defense", state: "decreased" },
      { kind: "flag", flag: "charged" },
    ])
  })
})
