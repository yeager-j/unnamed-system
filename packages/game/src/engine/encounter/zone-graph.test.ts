import { describe, expect, it } from "vitest"

import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import { adjacentZones } from "@workspace/game/engine/encounter/zone-graph"

function sessionWithGraph() {
  const base = createCombatSession(() => "unused-id")([])
  return {
    ...base,
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
  }
}

describe("adjacentZones", () => {
  it("resolves a zone's neighbors to Zone objects", () => {
    const session = sessionWithGraph()
    expect(adjacentZones(session, "zone-a").map((z) => z.name)).toEqual([
      "Hall",
      "Cellar",
    ])
  })

  it("returns [] for a zone with no adjacency entry", () => {
    const session = sessionWithGraph()
    expect(adjacentZones(session, "zone-orphan")).toEqual([])
  })

  it("skips an adjacency id that points at a removed zone", () => {
    const session = sessionWithGraph()
    const withDangling = {
      ...session,
      adjacency: { ...session.adjacency, "zone-a": ["zone-b", "ghost"] },
    }
    expect(adjacentZones(withDangling, "zone-a").map((z) => z.id)).toEqual([
      "zone-b",
    ])
  })
})
