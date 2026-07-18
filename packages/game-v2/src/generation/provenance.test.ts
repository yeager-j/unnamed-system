import { describe, expect, it } from "vitest"

import {
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { withAuthoredProvenance } from "./provenance"

describe("withAuthoredProvenance", () => {
  const snapshot = () =>
    makeMapInstanceState({
      geometry: makeGeometry([
        makeZone("zone-a", { name: "Gatehouse" }),
        makeZone("zone-b", { name: "Cellar" }),
      ]),
    })

  it("stamps every geometry Zone authored", () => {
    const next = withAuthoredProvenance(snapshot())

    expect(next.generation.zones).toEqual({
      "zone-a": { source: "authored" },
      "zone-b": { source: "authored" },
    })
  })

  it("replaces any pre-existing provenance (a fresh snapshot is all-authored)", () => {
    const seeded = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
      generation: { zones: { "zone-a": { source: "manual" } }, grafts: {} },
    })

    expect(withAuthoredProvenance(seeded).generation.zones).toEqual({
      "zone-a": { source: "authored" },
    })
  })

  it("preserves grafts and the rest of the state", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
      occupancy: { c0: { zoneId: "zone-a", engagement: { status: "free" } } },
      reveal: {
        revealedZoneIds: ["zone-a"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
      generation: {
        zones: {},
        grafts: { "map-x": { pageIds: ["p1"] } },
      },
    })

    const next = withAuthoredProvenance(state)

    expect(next.generation.grafts).toEqual({ "map-x": { pageIds: ["p1"] } })
    expect(next.occupancy).toEqual(state.occupancy)
    expect(next.reveal).toEqual(state.reveal)
  })

  it("returns a fresh object without mutating the input", () => {
    const state = snapshot()
    const before = structuredClone(state)

    const next = withAuthoredProvenance(state)

    expect(next).not.toBe(state)
    expect(state).toEqual(before)
  })

  it("yields an empty provenance map for a geometry-less snapshot", () => {
    expect(
      withAuthoredProvenance(makeMapInstanceState()).generation.zones
    ).toEqual({})
  })
})
