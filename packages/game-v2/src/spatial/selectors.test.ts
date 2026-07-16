import { describe, expect, it } from "vitest"

import { engaged, free, makeMapInstanceState } from "./__fixtures__/spatial"
import {
  DEFAULT_PAGE_ID,
  defaultPages,
  type MapConnection,
  type MapGeometry,
  type MapZone,
} from "./geometry.schema"
import {
  activeEnchantment,
  adjacencyMap,
  adjacencyOf,
  adjacentZones,
  engagementOf,
  hopDistances,
  zoneOf,
} from "./selectors"

function zone(id: string, name = id): MapZone {
  return {
    id,
    name,
    description: "",
    dmNotes: "",
    position: { x: 0, y: 0 },
    pageId: DEFAULT_PAGE_ID,
  }
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
  pages: defaultPages(),
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
      expect(
        adjacencyMap({ pages: defaultPages(), zones: {}, connections: {} })
      ).toEqual({})
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
        pages: defaultPages(),
        zones: { a: zone("a") },
        connections: { "a-gone": connection("a", "gone") },
      }
      expect(adjacentZones(dangling, "a")).toEqual([])
    })
  })

  describe("hopDistances", () => {
    it("counts hops along a chain from a single origin", () => {
      // a - b - c ; d isolated
      expect(hopDistances(Object.values(geometry.connections), ["a"])).toEqual({
        a: 0,
        b: 1,
        c: 2,
      })
    })

    it("omits unreachable zones (an isolated zone gets no entry)", () => {
      const distances = hopDistances(Object.values(geometry.connections), ["a"])
      expect(distances.d).toBeUndefined()
    })

    it("takes the nearest origin under multi-source search", () => {
      // a - b - c: origins a & c both reach b at distance 1
      expect(
        hopDistances(Object.values(geometry.connections), ["a", "c"])
      ).toEqual({ a: 0, b: 1, c: 0 })
    })

    it("finds the shortest path around a cycle, not the first walked", () => {
      // diamond: a-b, a-c, b-d, c-d — d is 2 hops from a by either arm
      const diamond: MapConnection[] = [
        connection("a", "b"),
        connection("a", "c"),
        connection("b", "d"),
        connection("c", "d"),
      ]
      expect(hopDistances(diamond, ["a"])).toEqual({ a: 0, b: 1, c: 1, d: 2 })
    })

    it("maps empty origins to an empty record", () => {
      expect(hopDistances(Object.values(geometry.connections), [])).toEqual({})
    })

    it("dedupes repeated origins without inflating distance", () => {
      expect(
        hopDistances(Object.values(geometry.connections), ["a", "a"])
      ).toEqual({ a: 0, b: 1, c: 2 })
    })
  })
})
