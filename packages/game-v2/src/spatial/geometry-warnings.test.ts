import { describe, expect, it } from "vitest"

import { makeConnection, makeGeometry, makeZone } from "./__fixtures__/spatial"
import { disconnectedZoneIds, duplicateZoneNames } from "./geometry-warnings"

describe("disconnectedZoneIds", () => {
  it("returns nothing for fewer than two zones", () => {
    expect(disconnectedZoneIds(makeGeometry())).toEqual([])
    expect(disconnectedZoneIds(makeGeometry([makeZone("a")]))).toEqual([])
  })

  it("flags both zones when two are unconnected", () => {
    expect(
      disconnectedZoneIds(makeGeometry([makeZone("a"), makeZone("b")])).sort()
    ).toEqual(["a", "b"])
  })

  it("flags only the isolated zone", () => {
    const g = makeGeometry(
      [makeZone("a"), makeZone("b"), makeZone("c")],
      [makeConnection("ab", "a", "b")]
    )
    expect(disconnectedZoneIds(g)).toEqual(["c"])
  })

  it("returns nothing when every zone has an edge", () => {
    const g = makeGeometry(
      [makeZone("a"), makeZone("b")],
      [makeConnection("ab", "a", "b")]
    )
    expect(disconnectedZoneIds(g)).toEqual([])
  })
})

describe("duplicateZoneNames", () => {
  it("returns nothing when all names are distinct", () => {
    expect(
      duplicateZoneNames(
        makeGeometry([
          makeZone("a", { name: "Hall" }),
          makeZone("b", { name: "Crypt" }),
        ])
      )
    ).toEqual([])
  })

  it("detects duplicates trimmed + case-insensitively, returning one representative", () => {
    const g = makeGeometry([
      makeZone("a", { name: "Hall" }),
      makeZone("b", { name: " hall " }),
      makeZone("c", { name: "Crypt" }),
    ])
    expect(duplicateZoneNames(g)).toEqual(["Hall"])
  })

  it("reports one representative per colliding group", () => {
    const g = makeGeometry([
      makeZone("a", { name: "Hall" }),
      makeZone("b", { name: "Hall" }),
      makeZone("c", { name: "Vault" }),
      makeZone("d", { name: "Vault" }),
    ])
    expect(duplicateZoneNames(g).sort()).toEqual(["Hall", "Vault"])
  })
})
