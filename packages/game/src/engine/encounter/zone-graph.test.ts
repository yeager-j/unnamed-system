import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game/engine/__fixtures__/encounter"
import {
  adjacencyMap,
  adjacentZones,
} from "@workspace/game/engine/encounter/zone-graph"

function instanceWithGraph() {
  return makeMapInstanceState({
    geometry: makeGeometry(
      [
        makeZone("zone-a", { name: "Courtyard" }),
        makeZone("zone-b", { name: "Hall" }),
        makeZone("zone-c", { name: "Cellar" }),
      ],
      [
        makeConnection("conn-ab", "zone-a", "zone-b"),
        makeConnection("conn-ac", "zone-a", "zone-c"),
      ]
    ),
  })
}

describe("adjacentZones", () => {
  it("resolves a zone's neighbors to Zone objects", () => {
    expect(
      adjacentZones(instanceWithGraph(), "zone-a").map((z) => z.name)
    ).toEqual(["Hall", "Cellar"])
  })

  it("returns [] for a zone with no connections", () => {
    expect(adjacentZones(instanceWithGraph(), "zone-orphan")).toEqual([])
  })

  it("skips a connection that points at a removed zone", () => {
    const withDangling = makeMapInstanceState({
      geometry: makeGeometry(
        [
          makeZone("zone-a", { name: "Courtyard" }),
          makeZone("zone-b", { name: "Hall" }),
        ],
        [
          makeConnection("conn-ab", "zone-a", "zone-b"),
          makeConnection("conn-ag", "zone-a", "ghost"),
        ]
      ),
    })
    expect(adjacentZones(withDangling, "zone-a").map((z) => z.id)).toEqual([
      "zone-b",
    ])
  })
})

describe("adjacencyMap", () => {
  it("derives the undirected zone → neighbor-ids graph from connections", () => {
    const map = adjacencyMap(instanceWithGraph().geometry)
    expect(map["zone-a"]).toEqual(["zone-b", "zone-c"])
    expect(map["zone-b"]).toEqual(["zone-a"])
    expect(map["zone-c"]).toEqual(["zone-a"])
  })

  it("omits connections that dangle to a removed zone", () => {
    const geometry = makeGeometry(
      [makeZone("zone-a"), makeZone("zone-b")],
      [
        makeConnection("conn-ab", "zone-a", "zone-b"),
        makeConnection("conn-ag", "zone-a", "ghost"),
      ]
    )
    expect(adjacencyMap(geometry)["zone-a"]).toEqual(["zone-b"])
  })
})
