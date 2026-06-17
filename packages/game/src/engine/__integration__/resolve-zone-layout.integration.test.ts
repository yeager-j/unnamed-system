import { describe, expect, it } from "vitest"

import {
  enemyStatblocks,
  makeEncounter,
} from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { ENCHANTMENTS_BY_TYPE } from "@workspace/game/engine/encounter/enchantment"
import { resolveZoneLayout } from "@workspace/game/engine/encounter/resolve-zone-layout"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import { type MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

/** A fixture catalog whose "goblin" carries the name the token resolver reads —
 *  an opaque id assigned here, not the shipped creature. */
const CATALOG = makeTestGameData({
  enemies: [makeEnemy({ key: "goblin", name: "Goblin" })],
})

const sb = (combatants: Parameters<typeof enemyStatblocks>[0]) =>
  enemyStatblocks(combatants, CATALOG)

const ZONES = {
  "zone-a": { id: "zone-a", name: "Courtyard" },
  "zone-b": { id: "zone-b", name: "Hall" },
}
const ADJACENCY = { "zone-a": ["zone-b"], "zone-b": ["zone-a"] }

/** A session + Instance seeded with two adjacent zones (`zone-a` ↔ `zone-b`) and
 *  the given roster placed onto the Instance occupancy. */
function setupWith(
  roster: CombatantSetup[],
  instanceOverrides: Partial<MapInstanceState> = {}
) {
  return makeEncounter(roster, {
    zones: ZONES,
    adjacency: ADJACENCY,
    ...instanceOverrides,
  })
}

const PC_DETAIL: Record<string, PcCombatantDetail> = {
  char1: { name: "Brannis", portraitUrl: "/brannis.png" } as PcCombatantDetail,
}

function pc(characterId: string, zoneId: string): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

function goblin(zoneId: string): CombatantSetup {
  return {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId,
  }
}

describe("resolveZoneLayout", () => {
  it("groups combatants under the zone their zoneId references", () => {
    const { session, instance } = setupWith([
      pc("char1", "zone-a"),
      goblin("zone-b"),
    ])

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    const courtyard = view.zones.find((z) => z.id === "zone-a")!
    const hall = view.zones.find((z) => z.id === "zone-b")!
    expect(courtyard.combatants.map((c) => c.name)).toEqual(["Brannis"])
    expect(hall.combatants.map((c) => c.name)).toEqual(["Goblin"])
  })

  it("resolves each zone's adjacency to display names", () => {
    const { session, instance } = setupWith([])

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(
      view.zones.find((z) => z.id === "zone-a")!.adjacentZoneNames
    ).toEqual(["Hall"])
    expect(
      view.zones.find((z) => z.id === "zone-b")!.adjacentZoneNames
    ).toEqual(["Courtyard"])
  })

  it("buckets unplaced (empty zoneId) and stale-zone combatants into unplaced", () => {
    const { session, instance } = setupWith([
      pc("char1", ""),
      goblin("zone-gone"),
    ])

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(view.unplaced.map((c) => c.name)).toEqual(["Brannis", "Goblin"])
    expect(view.zones.every((z) => z.combatants.length === 0)).toBe(true)
  })

  it("shapes the token's side, isPc, and portrait", () => {
    const { session, instance } = setupWith([
      pc("char1", "zone-a"),
      goblin("zone-a"),
    ])

    const tokens = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    ).zones.find((z) => z.id === "zone-a")!.combatants

    expect(tokens[0]).toMatchObject({
      name: "Brannis",
      side: "players",
      isPc: true,
      portraitUrl: "/brannis.png",
    })
    expect(tokens[1]).toMatchObject({
      name: "Goblin",
      side: "enemies",
      isPc: false,
      portraitUrl: null,
    })
  })

  it("reports hasZones false and everyone unplaced for an unzoned encounter", () => {
    const { session, instance } = makeEncounter([pc("char1", "")])

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(view.hasZones).toBe(false)
    expect(view.zones).toEqual([])
    expect(view.unplaced.map((c) => c.name)).toEqual(["Brannis"])
  })

  it("reports hasZones true and no unplaced when every combatant is in a real zone", () => {
    const { session, instance } = setupWith([
      pc("char1", "zone-a"),
      goblin("zone-b"),
    ])

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(view.hasZones).toBe(true)
    expect(view.unplaced).toEqual([])
  })

  it("renders a PC with no detail entry with a null portrait (detail miss is safe)", () => {
    const { session, instance } = setupWith([pc("char-unknown", "zone-a")])

    const token = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    ).zones.find((z) => z.id === "zone-a")!.combatants[0]!

    expect(token.isPc).toBe(true)
    expect(token.portraitUrl).toBeNull()
  })

  it("is undefined-safe when an adjacency entry points at a removed zone", () => {
    const { session, instance } = setupWith([], {
      adjacency: { "zone-a": ["zone-b", "ghost"], "zone-b": ["zone-a"] },
    })

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(
      view.zones.find((z) => z.id === "zone-a")!.adjacentZoneNames
    ).toEqual(["Hall"])
  })

  it("badges the Enchanted Zone with its name, Forte marking, and rule lines — others stay bare", () => {
    const { session, instance } = setupWith([], {
      enchantment: { zoneId: "zone-a", type: "toccata", forte: 2 },
    })

    const view = resolveZoneLayout(
      session,
      instance,
      PC_DETAIL,
      sb(session.combatants)
    )

    expect(view.zones.find((z) => z.id === "zone-a")!.enchantment).toEqual({
      type: "toccata",
      name: "Toccata",
      forte: 2,
      marking: "ff",
      lines: ENCHANTMENTS_BY_TYPE.toccata.forteLines.map((text, index) => ({
        forte: index + 1,
        text,
        active: index < 2,
      })),
    })
    expect(
      view.zones.find((z) => z.id === "zone-b")!.enchantment
    ).toBeUndefined()
  })
})
