import { describe, expect, it } from "vitest"

import { makeMapInstanceState } from "@workspace/game/engine/__fixtures__/encounter"
import { adjacentZones } from "@workspace/game/engine/encounter/zone-graph"

function instanceWithGraph() {
  return makeMapInstanceState({
    zones: {
      "zone-a": { id: "zone-a", name: "Courtyard" },
      "zone-b": { id: "zone-b", name: "Hall" },
      "zone-c": { id: "zone-c", name: "Cellar" },
    },
    adjacency: {
      "zone-a": ["zone-b", "zone-c"],
      "zone-b": ["zone-a"],
      "zone-c": ["zone-a"],
    },
  })
}

describe("adjacentZones", () => {
  it("resolves a zone's neighbors to Zone objects", () => {
    expect(
      adjacentZones(instanceWithGraph(), "zone-a").map((z) => z.name)
    ).toEqual(["Hall", "Cellar"])
  })

  it("returns [] for a zone with no adjacency entry", () => {
    expect(adjacentZones(instanceWithGraph(), "zone-orphan")).toEqual([])
  })

  it("skips an adjacency id that points at a removed zone", () => {
    const instance = instanceWithGraph()
    const withDangling = makeMapInstanceState({
      ...instance,
      adjacency: { ...instance.adjacency, "zone-a": ["zone-b", "ghost"] },
    })
    expect(adjacentZones(withDangling, "zone-a").map((z) => z.id)).toEqual([
      "zone-b",
    ])
  })
})
