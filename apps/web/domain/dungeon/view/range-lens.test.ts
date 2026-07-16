import { describe, expect, it } from "vitest"

import { buildRangeLens } from "./range-lens"

/** a - b - c ; d isolated. */
const connections = [
  { fromZoneId: "a", toZoneId: "b" },
  { fromZoneId: "b", toZoneId: "c" },
]

describe("buildRangeLens (§D5 — the one policy home)", () => {
  it("labels the origin with its gold-star text and counts hops outward", () => {
    expect(
      buildRangeLens({ connections, origins: ["a"], originLabel: "Party" })
    ).toEqual({
      a: { label: "Party", origin: true },
      b: { label: "1", origin: false },
      c: { label: "2", origin: false },
    })
  })

  it("omits unreachable zones entirely (no badge)", () => {
    const lens = buildRangeLens({ connections, origins: ["a"] })
    expect(lens.d).toBeUndefined()
  })

  it("counts from a single origin with no label (the combat actor case)", () => {
    expect(buildRangeLens({ connections, origins: ["b"] })).toEqual({
      a: { label: "1", origin: false },
      b: { label: "", origin: true },
      c: { label: "1", origin: false },
    })
  })

  it("treats multiple origins as sources at distance 0", () => {
    const lens = buildRangeLens({
      connections,
      origins: ["a", "c"],
      originLabel: "Party",
    })
    expect(lens.a).toEqual({ label: "Party", origin: true })
    expect(lens.c).toEqual({ label: "Party", origin: true })
    expect(lens.b).toEqual({ label: "1", origin: false })
  })

  it("maps empty origins to an empty lens", () => {
    expect(buildRangeLens({ connections, origins: [] })).toEqual({})
  })
})
