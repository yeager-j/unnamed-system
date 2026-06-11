import { describe, expect, it } from "vitest"

import type {
  EncounterSnapshot,
  PlayerVisibleCombatant,
} from "@workspace/game/engine/encounter/player-snapshot"
import { resolvePlayerZoneLayout } from "@workspace/game/engine/encounter/resolve-player-view"
import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation/character/state"

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
    conditionDurations: {},
    counters: {},
    engagedWith: [],
    kind: "enemy",
    hp: { current: 10, max: 10 },
    sp: null,
    portraitUrl: null,
  }
}

function pc(id: string, zoneId: string): PlayerVisibleCombatant {
  return {
    id,
    name: id,
    side: "players",
    zoneId,
    hasActed: false,
    isCurrent: false,
    ailments: [],
    battleConditions: { ...DEFAULT_BATTLE_CONDITIONS },
    conditionDurations: {},
    counters: {},
    engagedWith: [],
    kind: "pc",
    hp: { current: 20, max: 20 },
    sp: { current: 10, max: 10 },
    attributes: { strength: 1, magic: 1, agility: 1, luck: 1 },
    portraitUrl: `/portrait/${id}.png`,
  }
}

function snapshot(
  combatants: PlayerVisibleCombatant[],
  zones: EncounterSnapshot["zones"],
  adjacency: Record<string, string[]> = {}
): EncounterSnapshot {
  return {
    status: "live",
    name: "Test",
    campaignShortId: "camp-1",
    version: 1,
    round: 1,
    currentActor: null,
    combatants,
    zones,
    adjacency,
    enchantment: null,
  }
}

describe("resolvePlayerZoneLayout", () => {
  it("groups combatants by zone and resolves adjacency to display names", () => {
    const view = resolvePlayerZoneLayout(
      snapshot(
        [pc("hero", "z1"), enemy("a", "z2"), enemy("b", "z1")],
        [
          { id: "z1", name: "Bridge" },
          { id: "z2", name: "Riverbank" },
        ],
        { z1: ["z2"], z2: ["z1"] }
      )
    )

    expect(view.hasZones).toBe(true)
    expect(view.zones.map((z) => z.id)).toEqual(["z1", "z2"])
    expect(view.zones[0]!.combatants.map((c) => c.id)).toEqual(["hero", "b"])
    expect(view.zones[0]!.adjacentZoneNames).toEqual(["Riverbank"])
    expect(view.zones[1]!.adjacentZoneNames).toEqual(["Bridge"])
  })

  it("maps the PC/enemy split and portrait onto the token", () => {
    const view = resolvePlayerZoneLayout(
      snapshot(
        [pc("hero", "z1"), enemy("a", "z1")],
        [{ id: "z1", name: "Bridge" }]
      )
    )

    const [hero, foe] = view.zones[0]!.combatants
    expect(hero).toMatchObject({
      isPc: true,
      portraitUrl: "/portrait/hero.png",
    })
    expect(foe).toMatchObject({ isPc: false, portraitUrl: null })
  })

  it("buckets combatants whose zone is unknown into unplaced", () => {
    const view = resolvePlayerZoneLayout(
      snapshot(
        [enemy("a", "z1"), enemy("b", "stale")],
        [{ id: "z1", name: "Bridge" }]
      )
    )

    expect(view.zones[0]!.combatants.map((c) => c.id)).toEqual(["a"])
    expect(view.unplaced.map((c) => c.id)).toEqual(["b"])
  })

  it("reports no zones for an unzoned encounter", () => {
    const view = resolvePlayerZoneLayout(snapshot([enemy("a", "")], []))
    expect(view.hasZones).toBe(false)
    expect(view.unplaced.map((c) => c.id)).toEqual(["a"])
  })

  it("badges the Enchanted Zone from the snapshot — others stay bare", () => {
    const view = resolvePlayerZoneLayout({
      ...snapshot(
        [pc("hero", "z1")],
        [
          { id: "z1", name: "Bridge" },
          { id: "z2", name: "Riverbank" },
        ]
      ),
      enchantment: { zoneId: "z2", type: "tarantella", forte: 1 },
    })

    expect(view.zones.find((z) => z.id === "z2")!.enchantment).toMatchObject({
      type: "tarantella",
      name: "Tarantella",
      forte: 1,
      marking: "f",
    })
    expect(view.zones.find((z) => z.id === "z1")!.enchantment).toBeUndefined()
  })
})
