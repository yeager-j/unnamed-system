import { describe, expect, it } from "vitest"

import {
  NOTCH,
  notchAnchorOf,
  stubAnchorOf,
  thresholdAnchors,
  type Rect,
} from "./threshold-geometry"

const rect = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h })

describe("thresholdAnchors", () => {
  it("places notches on the facing left/right walls when zones are more horizontally apart", () => {
    const a = rect(0, 0)
    const b = rect(300, 0)
    const [an, bn] = thresholdAnchors(a, b)

    expect(an.orient).toBe("v")
    expect(bn.orient).toBe("v")
    expect(an.x).toBe(100) // a's right wall
    expect(bn.x).toBe(300) // b's left wall
    expect(an.side).toBe("e") // a's notch opens east, toward b
    expect(bn.side).toBe("w") // b's notch opens west, toward a
  })

  it("returns anchors in input order regardless of which zone is on the right", () => {
    const a = rect(300, 0)
    const b = rect(0, 0)
    const [an, bn] = thresholdAnchors(a, b)

    expect(an.x).toBe(300) // a's left wall (a is on the right)
    expect(bn.x).toBe(100) // b's right wall
  })

  it("places notches on the top/bottom walls when zones are more vertically apart", () => {
    const a = rect(0, 0)
    const b = rect(0, 300)
    const [an, bn] = thresholdAnchors(a, b)

    expect(an.orient).toBe("h")
    expect(bn.orient).toBe("h")
    expect(an.y).toBe(100) // a's bottom wall
    expect(bn.y).toBe(300) // b's top wall
    expect(an.side).toBe("s") // a's notch opens south, toward b
    expect(bn.side).toBe("n") // b's notch opens north, toward a
  })

  it("faces the gap axis: zones sharing an x-band but separated in y get top/bottom notches, even when center-dx exceeds center-dy", () => {
    // Zone A above, Zone B below-and-right — they overlap in x (a: 0..300, b: 200..500
    // share 200..300) but are separated in y. Center dx (350) > center dy (300), yet
    // the clean threshold is A's bottom wall ↔ B's top wall through the shared column.
    const a = { x: 0, y: 0, w: 300, h: 200 }
    const b = { x: 200, y: 350, w: 300, h: 200 }
    const [an, bn] = thresholdAnchors(a, b)

    expect(an.orient).toBe("h")
    expect(an.side).toBe("s") // A's bottom wall
    expect(an.y).toBe(200)
    expect(bn.orient).toBe("h")
    expect(bn.side).toBe("n") // B's top wall
    expect(bn.y).toBe(350)
    // both centred on the shared x-band (200..300 → midpoint 250)
    expect(an.x).toBe(250)
    expect(bn.x).toBe(250)
  })

  it("centres both notches on the overlap band of the facing walls", () => {
    // a spans y 0..100, b spans y 40..140 → overlap band 40..100, midpoint 70
    const a = rect(0, 0)
    const b = rect(300, 40)
    const [an, bn] = thresholdAnchors(a, b)

    expect(an.y).toBe(70)
    expect(bn.y).toBe(70)
  })

  it("clamps each notch onto its own wall when the facing ranges do not overlap", () => {
    // a spans y 0..100, b spans y 200..300 — horizontally dominant (dx 500 > dy 200), no y overlap
    const a = rect(0, 0)
    const b = rect(500, 200)
    const [an, bn] = thresholdAnchors(a, b)

    // clamp keeps the notch off the corner: within [start + along/2 + 8, start + len - along/2 - 8]
    const hiA = 0 + 100 - NOTCH.along / 2 - 8
    expect(an.y).toBe(hiA) // midpoint sits below a, clamps to a's lower corner

    const loB = 200 + NOTCH.along / 2 + 8
    expect(bn.y).toBe(loB) // midpoint sits above b, clamps to b's upper corner
  })

  it("routes a chain of three zones as independent facing pairs", () => {
    const a = rect(0, 0)
    const b = rect(300, 0)
    const c = rect(600, 0)
    const [, abRight] = thresholdAnchors(a, b)
    const [bcLeft] = thresholdAnchors(b, c)

    expect(abRight.x).toBe(300) // b's left wall faces a
    expect(bcLeft.x).toBe(400) // b's right wall faces c
  })
})

describe("stubAnchorOf / notchAnchorOf round trip", () => {
  it("derives the near stub's side + normalized offset", () => {
    const near = rect(0, 0)
    const far = rect(300, 40)
    const exit = stubAnchorOf(near, far)

    expect(exit.side).toBe("e") // far is to the right → near's east wall
    expect(exit.offset).toBeCloseTo(0.7) // overlap midpoint y=70 over height 100
  })

  it("names the vertical (n/s) walls when the far zone is above or below", () => {
    const near = rect(0, 0)
    expect(stubAnchorOf(near, rect(0, 300)).side).toBe("s")
    expect(stubAnchorOf(near, rect(0, -300)).side).toBe("n")
  })

  it("reconstructs the exact revealed near-notch position (no transition jump)", () => {
    const near = rect(120, 60)
    const far = rect(500, 120)
    const exit = stubAnchorOf(near, far)
    const reconstructed = notchAnchorOf(
      exit,
      { x: near.x, y: near.y },
      { w: near.w, h: near.h }
    )

    const [revealedNearNotch] = thresholdAnchors(near, far)
    expect(reconstructed).toEqual(revealedNearNotch)
  })
})
