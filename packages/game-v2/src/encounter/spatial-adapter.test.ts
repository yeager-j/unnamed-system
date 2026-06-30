import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  engaged,
  free,
  makeMapInstanceState,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { mapInstanceComponentsFor, spatialReadsFor } from "./spatial-adapter"

const pid = asParticipantId

describe("spatialReadsFor (the combat-side SpatialReads adapter, SD8)", () => {
  it("wraps zoneOf + the enchantment singleton over the map-instance", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { p1: free("z1") },
      enchantment: { zoneId: "z1", type: "toccata", forte: 2 },
    })
    const reads = spatialReadsFor(mapInstance)
    expect(reads.zoneOf(pid("p1"))).toBe("z1")
    expect(reads.activeEnchantment()).toEqual({
      zoneId: "z1",
      type: "toccata",
      forte: 2,
    })
  })

  it("reproduces the mapless stub over an empty map-instance", () => {
    const reads = spatialReadsFor(makeMapInstanceState())
    expect(reads.zoneOf(pid("ghost"))).toBeUndefined()
    expect(reads.activeEnchantment()).toBeNull()
  })
})

describe("mapInstanceComponentsFor (the read-bag projection, SD8)", () => {
  it("projects an occupied token to { position, engagement }", () => {
    const mapInstance = makeMapInstanceState({
      occupancy: { p1: engaged("z1", ["p2"]) },
    })
    expect(mapInstanceComponentsFor(mapInstance)(pid("p1"))).toEqual({
      position: { zoneId: "z1" },
      engagement: { status: "engaged", targetCombatantIds: ["p2"] },
    })
  })

  it("projects an unplaced participant to {} (no instance keys, engagedWith stays [])", () => {
    const components = mapInstanceComponentsFor(makeMapInstanceState())(
      pid("ghost")
    )
    expect(components).toEqual({})
    expect("position" in components).toBe(false)
    expect("engagement" in components).toBe(false)
  })
})
