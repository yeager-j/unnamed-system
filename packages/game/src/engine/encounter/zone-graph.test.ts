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
  movableZonesForCombatant,
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

describe("movableZonesForCombatant", () => {
  // zone-d is deliberately unconnected, so only the override surfaces it.
  function instanceWith(zoneId: string) {
    return makeMapInstanceState({
      geometry: makeGeometry(
        [
          makeZone("zone-a"),
          makeZone("zone-b"),
          makeZone("zone-c"),
          makeZone("zone-d"),
        ],
        [
          makeConnection("conn-ab", "zone-a", "zone-b"),
          makeConnection("conn-ac", "zone-a", "zone-c"),
        ]
      ),
      occupancy: { "c-0": { zoneId, engagement: { status: "free" } } },
    })
  }

  it("returns the acting Zone's adjacent Zones, excluding itself", () => {
    expect(
      movableZonesForCombatant(instanceWith("zone-a"), "c-0", {
        anywhere: false,
      }).sort()
    ).toEqual(["zone-b", "zone-c"])
  })

  it("opens to every other Zone under the move-anywhere override", () => {
    expect(
      movableZonesForCombatant(instanceWith("zone-a"), "c-0", {
        anywhere: true,
      }).sort()
    ).toEqual(["zone-b", "zone-c", "zone-d"])
  })

  it("falls back to every other Zone when the combatant stands off the graph", () => {
    expect(
      movableZonesForCombatant(instanceWith("ghost"), "c-0", {
        anywhere: false,
      }).sort()
    ).toEqual(["zone-a", "zone-b", "zone-c", "zone-d"])
  })

  it("returns [] when the combatant has no token", () => {
    expect(
      movableZonesForCombatant(instanceWith("zone-a"), "c-missing", {
        anywhere: false,
      })
    ).toEqual([])
  })
})
