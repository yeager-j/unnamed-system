import { describe, expect, it } from "vitest"

import {
  footprintOf,
  rectOfZone,
  rectsOverlap,
  sideBetween,
  ZONE_FOOTPRINTS,
  type Rect,
} from "./footprints"

const rect = (x: number, y: number, w = 336, h = 192): Rect => ({ x, y, w, h })

describe("footprintOf / rectOfZone", () => {
  it("maps each size to its fixed rect and defaults unset to M", () => {
    expect(footprintOf("S")).toEqual(ZONE_FOOTPRINTS.S)
    expect(footprintOf(undefined)).toEqual(ZONE_FOOTPRINTS.M)
  })

  it("places the footprint at the zone's position (top-left)", () => {
    expect(rectOfZone({ position: { x: 10, y: 20 }, size: "S" })).toEqual({
      x: 10,
      y: 20,
      w: 208,
      h: 160,
    })
  })
})

describe("rectsOverlap", () => {
  it("detects interior overlap", () => {
    expect(rectsOverlap(rect(0, 0), rect(100, 0))).toBe(true)
  })

  it("treats edge-touching as non-overlap", () => {
    expect(rectsOverlap(rect(0, 0), rect(336, 0))).toBe(false)
  })

  it("returns false for disjoint rects", () => {
    expect(rectsOverlap(rect(0, 0), rect(1000, 1000))).toBe(false)
  })
})

describe("sideBetween", () => {
  // Cases mirror the app's `thresholdAnchors` rule (UNN-633): the wall faces
  // across the axis on which the rects DON'T overlap; collisions and pure
  // diagonals fall back to center dominance.

  it("side-by-side rects (shared y-band) face e/w", () => {
    expect(sideBetween(rect(0, 0), rect(500, 40))).toBe("e")
    expect(sideBetween(rect(500, 40), rect(0, 0))).toBe("w")
  })

  it("stacked rects (shared x-band) face n/s", () => {
    expect(sideBetween(rect(0, 0), rect(40, 400))).toBe("s")
    expect(sideBetween(rect(40, 400), rect(0, 0))).toBe("n")
  })

  it("a shared column wins even when the partner is farther on x than y", () => {
    // far sits slightly up-and-right but still overlaps near's x-band: the
    // connection runs through the shared column, so the wall is n/s, not e/w.
    const near = rect(0, 0)
    const far = rect(300, -300)
    expect(sideBetween(near, far)).toBe("n")
  })

  it("a pure diagonal falls back to center dominance", () => {
    expect(sideBetween(rect(0, 0), rect(1000, 400))).toBe("e")
    expect(sideBetween(rect(0, 0), rect(400, 1000))).toBe("s")
  })
})
