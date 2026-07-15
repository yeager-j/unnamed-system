import { describe, expect, it } from "vitest"

import {
  footprintOf,
  overlappingZonePairs,
  ZONE_FOOTPRINTS,
  zoneTokenCapacity,
  type ZoneSize,
} from "./footprints"

type ZoneInput = {
  id: string
  position: { x: number; y: number }
  size?: ZoneSize
}

const zone = (
  id: string,
  x: number,
  y: number,
  size?: ZoneSize
): ZoneInput => ({ id, position: { x, y }, size })

describe("footprintOf", () => {
  it("maps each size to its fixed rect", () => {
    expect(footprintOf("S")).toEqual(ZONE_FOOTPRINTS.S)
    expect(footprintOf("XL")).toEqual(ZONE_FOOTPRINTS.XL)
  })

  it("defaults an unset size to M", () => {
    expect(footprintOf(undefined)).toEqual(ZONE_FOOTPRINTS.M)
  })

  it("uses grid-multiple (16 wu) dimensions", () => {
    for (const { w, h } of Object.values(ZONE_FOOTPRINTS)) {
      expect(w % 16).toBe(0)
      expect(h % 16).toBe(0)
    }
  })
})

describe("zoneTokenCapacity", () => {
  it("derives the no-cluster caps S 2 · M 4 · L 8 · XL 10", () => {
    expect(zoneTokenCapacity("S")).toBe(2)
    expect(zoneTokenCapacity("M")).toBe(4)
    expect(zoneTokenCapacity("L")).toBe(8)
    expect(zoneTokenCapacity("XL")).toBe(10)
  })

  it("defaults an unset size to the M capacity", () => {
    expect(zoneTokenCapacity(undefined)).toBe(4)
  })

  it("subtracts a header row per cluster: two disjoint pairs in an M room degrade", () => {
    // M cap is 4, but two multi-member clusters spend 48 wu of header, dropping the
    // grid below the 4 tokens the pairs need — the crowded path must kick in.
    expect(zoneTokenCapacity("M", 2)).toBe(2)
    expect(zoneTokenCapacity("M", 2)).toBeLessThan(4)
  })

  it("floors at 1 row (2 columns) even under heavy cluster overhead", () => {
    expect(zoneTokenCapacity("S", 5)).toBe(2)
  })
})

describe("overlappingZonePairs", () => {
  it("reports a pair whose footprints share interior area", () => {
    // Two M zones (336×192) 100 wu apart on x overlap.
    const pairs = overlappingZonePairs([zone("a", 0, 0), zone("b", 100, 0)])
    expect(pairs).toEqual([["a", "b"]])
  })

  it("treats edge-touching as non-overlap", () => {
    // b starts exactly where a's M footprint ends (x = 336).
    const pairs = overlappingZonePairs([zone("a", 0, 0), zone("b", 336, 0)])
    expect(pairs).toEqual([])
  })

  it("returns nothing for disjoint zones", () => {
    const pairs = overlappingZonePairs([zone("a", 0, 0), zone("b", 1000, 1000)])
    expect(pairs).toEqual([])
  })

  it("is size-driven: a larger footprint reaches a neighbor a small one wouldn't", () => {
    // b sits 400 wu right of a. As S (208) they miss; as XL (560) a reaches b.
    const asSmall = overlappingZonePairs([
      zone("a", 0, 0, "S"),
      zone("b", 400, 0, "S"),
    ])
    expect(asSmall).toEqual([])

    const asLarge = overlappingZonePairs([
      zone("a", 0, 0, "XL"),
      zone("b", 400, 0, "S"),
    ])
    expect(asLarge).toEqual([["a", "b"]])
  })

  it("reports each colliding pair once across three stacked zones", () => {
    const pairs = overlappingZonePairs([
      zone("a", 0, 0),
      zone("b", 20, 20),
      zone("c", 40, 40),
    ])
    expect(pairs).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ])
  })
})
