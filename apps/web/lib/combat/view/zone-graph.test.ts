import { describe, expect, it } from "vitest"

import type { MapGeometry } from "@workspace/game-v2/spatial"

import { connection, zone } from "./__fixtures__/combat-view"
import { adjacencyMap, adjacentZones } from "./zone-graph"

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

describe("adjacencyMap", () => {
  it("lists both endpoints of every connection (undirected)", () => {
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
