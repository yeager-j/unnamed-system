import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import { makeParticipant } from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { resolveSession } from "@/domain/game-engine-v2"

import {
  connection,
  instanceWith,
  sessionWith,
  token,
  withName,
  zone,
} from "./__fixtures__/combat-view"
import { buildConsoleZoneLayout } from "./zone-overview"

const heroId = asParticipantId("hero")
const gobId = asParticipantId("gob")
const strayId = asParticipantId("stray")

const session = sessionWith([
  makeParticipant(withName(goblin, "Roan"), heroId, { side: "players" }),
  makeParticipant(goblin, gobId, { side: "enemies" }),
  makeParticipant(withName(goblin, "Stray"), strayId, { side: "enemies" }),
])

const instance = instanceWith({
  zones: [zone("z1", "Hall"), zone("z2", "Cave"), zone("z3", "Vault")],
  connections: [connection("z1", "z2")],
  occupancy: {
    [heroId]: token("z1"),
    [gobId]: token("z1"),
    [strayId]: token("gone"),
  },
  enchantment: { zoneId: "z1", type: "toccata", forte: 2 },
})

describe("buildConsoleZoneLayout", () => {
  it("groups tokens under their zones and buckets stale placements as unplaced", () => {
    const layout = buildConsoleZoneLayout(
      instance,
      resolveSession(session, instance)
    )

    expect(layout.hasZones).toBe(true)
    expect(layout.zones.map((entry) => entry.name)).toEqual([
      "Hall",
      "Cave",
      "Vault",
    ])
    expect(layout.zones[0]?.combatants.map((c) => c.name)).toEqual([
      "Roan",
      "Goblin",
    ])
    expect(layout.zones[1]?.combatants).toEqual([])
    expect(layout.unplaced.map((c) => c.name)).toEqual(["Stray"])
  })

  it("names adjacent zones off the shared adjacency map", () => {
    const layout = buildConsoleZoneLayout(
      instance,
      resolveSession(session, instance)
    )

    expect(layout.zones[0]?.adjacentZoneNames).toEqual(["Cave"])
    expect(layout.zones[1]?.adjacentZoneNames).toEqual(["Hall"])
    expect(layout.zones[2]?.adjacentZoneNames).toEqual([])
  })

  it("rides the enchantment badge on its zone only", () => {
    const layout = buildConsoleZoneLayout(
      instance,
      resolveSession(session, instance)
    )

    expect(layout.zones[0]?.enchantment).toMatchObject({
      type: "toccata",
      forte: 2,
    })
    expect(layout.zones[1]?.enchantment).toBeUndefined()
  })

  it("reports an empty geometry as zoneless", () => {
    const mapless = instanceWith({})
    const layout = buildConsoleZoneLayout(
      mapless,
      resolveSession(session, mapless)
    )

    expect(layout.hasZones).toBe(false)
    expect(layout.zones).toEqual([])
    expect(layout.unplaced).toHaveLength(3)
  })
})
