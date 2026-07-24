import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGenerationState,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { authoredDepths, withAuthoredProvenance } from "./provenance"

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
      "zone-a": { source: "authored", depth: 0 },
      "zone-b": { source: "authored", depth: 0 },
    })
  })

  it("preserves the authored template binding in immutable provenance", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([
        makeZone("zone-a", { templateKey: "castle-entrance" }),
      ]),
    })

    expect(withAuthoredProvenance(state).generation.zones["zone-a"]).toEqual({
      source: "authored",
      depth: 0,
      templateKey: "castle-entrance",
    })
  })

  it("replaces any pre-existing provenance (a fresh snapshot is all-authored)", () => {
    const seeded = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a", { name: "A" })]),
      generation: makeGenerationState({
        zones: { "zone-a": { source: "manual", depth: 0 } },
      }),
    })

    expect(withAuthoredProvenance(seeded).generation.zones).toEqual({
      "zone-a": { source: "authored", depth: 0 },
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
      generation: makeGenerationState({
        grafts: { "map-x": { pageIds: ["p1"] } },
      }),
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

describe("authoredDepths (UNN-590, D5 step 3)", () => {
  // a — b — c, with d detached and e on a locked+hidden branch off b.
  const chain = () =>
    makeGeometry(
      [
        makeZone("a"),
        makeZone("b"),
        makeZone("c"),
        makeZone("d"),
        makeZone("e"),
      ],
      [
        makeConnection("ab", "a", "b"),
        makeConnection("bc", "b", "c"),
        makeConnection("be", "b", "e", { locked: true, hidden: true }),
      ]
    )

  it("computes BFS distance from the starting zone", () => {
    expect(authoredDepths(chain(), ["a"])).toEqual({
      a: 0,
      b: 1,
      c: 2,
      e: 2,
    })
  })

  it("is multi-source: a split start takes the nearest starting zone", () => {
    const depths = authoredDepths(chain(), ["a", "c"])
    expect(depths).toEqual({ a: 0, c: 0, b: 1, e: 2 })
  })

  it("traverses locked and hidden connections (world topology, not knowledge)", () => {
    expect(authoredDepths(chain(), ["a"])["e"]).toBe(2)
  })

  it("leaves unreachable zones absent (the stamp defaults them to 0)", () => {
    expect(authoredDepths(chain(), ["a"])["d"]).toBeUndefined()
    const stamped = withAuthoredProvenance(
      makeMapInstanceState({ geometry: chain() }),
      ["a"]
    )
    expect(stamped.generation.zones["d"]).toEqual({
      source: "authored",
      depth: 0,
    })
    expect(stamped.generation.zones["c"]).toEqual({
      source: "authored",
      depth: 2,
    })
  })

  it("ignores starting ids naming no real zone", () => {
    expect(authoredDepths(chain(), ["ghost"])).toEqual({})
  })
})
