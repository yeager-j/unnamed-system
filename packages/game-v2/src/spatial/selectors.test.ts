import { describe, expect, it } from "vitest"

import { engaged, free, makeMapInstanceState } from "./__fixtures__/spatial"
import type { MapConnection, MapGeometry, MapZone } from "./geometry.schema"
import {
  activeEnchantment,
  adjacencyMap,
  adjacencyOf,
  adjacentZones,
  engagementOf,
  zoneOf,
} from "./selectors"

function zone(id: string, name = id): MapZone {
  return { id, name, description: "", dmNotes: "", position: { x: 0, y: 0 } }
}

function connection(fromZoneId: string, toZoneId: string): MapConnection {
  return {
    id: `${fromZoneId}-${toZoneId}`,
    fromZoneId,
    toZoneId,
    hidden: false,
    locked: false,
  }
}

const geometry: MapGeometry = {
  zones: {
    a: zone("a", "Hall"),
    b: zone("b", "Cave"),
    c: zone("c", "Vault"),
    d: zone("d", "Crypt"),
  },
  connections: {
    "a-b": connection("a", "b"),
    "b-c": connection("b", "c"),
  },
}

describe("spatial selectors (the SpatialReads adapter source, SD8)", () => {
  describe("zoneOf", () => {
    it("returns the token's zone when the key is occupied", () => {
      const state = makeMapInstanceState({ occupancy: { p1: free("z1") } })
      expect(zoneOf(state, "p1")).toBe("z1")
    })

    it("returns undefined for an unplaced / mapless key (the unplaced contract)", () => {
      expect(zoneOf(makeMapInstanceState(), "ghost")).toBeUndefined()
    })
  })

  describe("activeEnchantment", () => {
    it("returns the singleton when one is active", () => {
      const enchantment = { zoneId: "z1", type: "toccata", forte: 2 } as const
      const state = makeMapInstanceState({ enchantment })
      expect(activeEnchantment(state)).toBe(enchantment)
    })

    it("returns null when no zone is enchanted", () => {
      expect(activeEnchantment(makeMapInstanceState())).toBeNull()
    })
  })

  describe("engagementOf", () => {
    it("returns the token's engagement when engaged", () => {
      const state = makeMapInstanceState({
        occupancy: { p1: engaged("z1", ["p2"]) },
      })
      expect(engagementOf(state, "p1")).toEqual({
        status: "engaged",
        targetCombatantIds: ["p2"],
      })
    })

    it("reads free for an absent key (structurally un-engaged, CD17)", () => {
      expect(engagementOf(makeMapInstanceState(), "ghost")).toEqual({
        status: "free",
      })
    })
  })

  describe("adjacencyOf", () => {
    it("lists both endpoints of every connection (undirected)", () => {
      expect(adjacencyOf(Object.values(geometry.connections))).toEqual({
        a: ["b"],
        b: ["a", "c"],
        c: ["b"],
      })
    })

    it("maps no connections to an empty record", () => {
      expect(adjacencyOf([])).toEqual({})
    })
  })

  describe("adjacencyMap", () => {
    it("seeds every zone, so an unconnected zone is present with an empty list", () => {
      expect(adjacencyMap(geometry)).toEqual({
        a: ["b"],
        b: ["a", "c"],
        c: ["b"],
        d: [],
      })
    })

    it("maps an empty geometry to an empty record", () => {
      expect(adjacencyMap({ zones: {}, connections: {} })).toEqual({})
    })
  })

  describe("adjacentZones", () => {
    it("resolves neighbors to their zones, from either endpoint", () => {
      expect(adjacentZones(geometry, "b").map((z) => z.name)).toEqual([
        "Hall",
        "Vault",
      ])
      expect(adjacentZones(geometry, "c").map((z) => z.id)).toEqual(["b"])
    })

    it("returns [] for an unconnected zone", () => {
      expect(adjacentZones(geometry, "d")).toEqual([])
    })

    it("drops a neighbor whose zone no longer exists", () => {
      const dangling: MapGeometry = {
        zones: { a: zone("a") },
        connections: { "a-gone": connection("a", "gone") },
      }
      expect(adjacentZones(dangling, "a")).toEqual([])
    })
  })
})
