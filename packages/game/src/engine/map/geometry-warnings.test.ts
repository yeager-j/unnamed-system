import { describe, expect, it } from "vitest"

import {
  mapGeometrySchema,
  type MapGeometry,
} from "@workspace/game/foundation/map/geometry"

import { disconnectedZoneIds, duplicateZoneNames } from "./geometry-warnings"

function geometry(
  zones: [id: string, name: string][],
  connections: [id: string, from: string, to: string][] = []
): MapGeometry {
  return mapGeometrySchema.parse({
    zones: Object.fromEntries(
      zones.map(([id, name]) => [
        id,
        { id, name, description: "", dmNotes: "", position: { x: 0, y: 0 } },
      ])
    ),
    connections: Object.fromEntries(
      connections.map(([id, fromZoneId, toZoneId]) => [
        id,
        { id, fromZoneId, toZoneId, hidden: false, locked: false },
      ])
    ),
  })
}

describe("disconnectedZoneIds", () => {
  it("returns nothing for fewer than two zones", () => {
    expect(disconnectedZoneIds(geometry([]))).toEqual([])
    expect(disconnectedZoneIds(geometry([["a", "A"]]))).toEqual([])
  })

  it("flags both zones when two are unconnected", () => {
    expect(
      disconnectedZoneIds(
        geometry([
          ["a", "A"],
          ["b", "B"],
        ])
      ).sort()
    ).toEqual(["a", "b"])
  })

  it("flags only the isolated zone", () => {
    const g = geometry(
      [
        ["a", "A"],
        ["b", "B"],
        ["c", "C"],
      ],
      [["ab", "a", "b"]]
    )
    expect(disconnectedZoneIds(g)).toEqual(["c"])
  })

  it("returns nothing when every zone has an edge", () => {
    const g = geometry(
      [
        ["a", "A"],
        ["b", "B"],
      ],
      [["ab", "a", "b"]]
    )
    expect(disconnectedZoneIds(g)).toEqual([])
  })
})

describe("duplicateZoneNames", () => {
  it("returns nothing when all names are distinct", () => {
    expect(
      duplicateZoneNames(
        geometry([
          ["a", "Hall"],
          ["b", "Crypt"],
        ])
      )
    ).toEqual([])
  })

  it("detects duplicates trimmed + case-insensitively, returning one representative", () => {
    const g = geometry([
      ["a", "Hall"],
      ["b", " hall "],
      ["c", "Crypt"],
    ])
    expect(duplicateZoneNames(g)).toEqual(["Hall"])
  })

  it("reports one representative per colliding group", () => {
    const g = geometry([
      ["a", "Hall"],
      ["b", "Hall"],
      ["c", "Vault"],
      ["d", "Vault"],
    ])
    expect(duplicateZoneNames(g).sort()).toEqual(["Hall", "Vault"])
  })
})
