import { describe, expect, it } from "vitest"

import {
  makeConnection,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"

import { seedMintedUniqueKeys, sproutStartStubs } from "./start"
import { templateSetContentSchema } from "./template-set.schema"

/** A set with one unique 3-exit template, one plain 2-exit template (one exit
 *  optional), and a tombstoned unique. */
const set = () =>
  templateSetContentSchema.parse({
    templates: {
      "castle-entrance": {
        key: "castle-entrance",
        unique: true,
        exits: [{ optional: false }, { optional: false }, { optional: false }],
      },
      hall: {
        key: "hall",
        exits: [{ optional: false }, { optional: true }],
      },
      "dead-god": {
        key: "dead-god",
        unique: true,
        tombstoned: true,
        exits: [{ optional: false }],
      },
    },
  })

/** Sequential stub ids so assertions stay readable. */
const sequentialIds = () => {
  let n = 0
  return () => `stub-${n++}`
}

describe("seedMintedUniqueKeys (D5 step 4 — the ledger law's delve-start case)", () => {
  it("seeds bound authored unique templates, skipping non-unique, unknown, and tombstoned keys", () => {
    const geometry = makeGeometry([
      makeZone("a", { templateKey: "castle-entrance" }),
      makeZone("b", { templateKey: "hall" }),
      makeZone("c", { templateKey: "no-such-template" }),
      makeZone("d", { templateKey: "dead-god" }),
      makeZone("e"),
    ])
    expect(seedMintedUniqueKeys(geometry, set())).toEqual(["castle-entrance"])
  })

  it("dedupes two authored bindings of one unique template", () => {
    const geometry = makeGeometry([
      makeZone("a", { templateKey: "castle-entrance" }),
      makeZone("b", { templateKey: "castle-entrance" }),
    ])
    expect(seedMintedUniqueKeys(geometry, set())).toEqual(["castle-entrance"])
  })
})

describe("sproutStartStubs (D5 step 6)", () => {
  it("budget = exits − authored connections, floored at 0", () => {
    // Entrance (3 required exits) with one authored connection → 2 stubs;
    // its neighbor bound to hall (1 required + 1 optional) with one authored
    // connection → 0 or 1 stubs depending on the cull.
    const geometry = makeGeometry(
      [
        makeZone("a", { templateKey: "castle-entrance" }),
        makeZone("b", { templateKey: "hall", position: { x: 500, y: 0 } }),
      ],
      [makeConnection("ab", "a", "b")]
    )
    const { stubs } = sproutStartStubs({
      state: makeMapInstanceState({ geometry }),
      set: set(),
      startingZoneIds: ["a"],
      seed: "seed-x",
      newId: sequentialIds(),
    })
    const zoneIds = Object.values(stubs).map((stub) => stub.zoneId)
    expect(zoneIds.filter((id) => id === "a")).toHaveLength(2)
    expect(zoneIds.filter((id) => id === "b").length).toBeLessThanOrEqual(1)
  })

  it("an over-connected zone sprouts nothing", () => {
    // hall has ≤2 exits; three authored connections exhaust the budget.
    const geometry = makeGeometry(
      [
        makeZone("a", { templateKey: "hall" }),
        makeZone("b", { position: { x: 500, y: 0 } }),
        makeZone("c", { position: { x: 0, y: 400 } }),
        makeZone("d", { position: { x: 500, y: 400 } }),
      ],
      [
        makeConnection("ab", "a", "b"),
        makeConnection("ac", "a", "c"),
        makeConnection("ad", "a", "d"),
      ]
    )
    const { stubs } = sproutStartStubs({
      state: makeMapInstanceState({ geometry }),
      set: set(),
      startingZoneIds: ["a"],
      seed: "seed-x",
      newId: sequentialIds(),
    })
    expect(stubs).toEqual({})
  })

  it("unknown and tombstoned templates skip gracefully; unbound zones never sprout", () => {
    const geometry = makeGeometry([
      makeZone("a", { templateKey: "no-such-template" }),
      makeZone("b", { templateKey: "dead-god" }),
      makeZone("c"),
    ])
    const { stubs, cursors } = sproutStartStubs({
      state: makeMapInstanceState({ geometry }),
      set: set(),
      startingZoneIds: ["a"],
      seed: "seed-x",
      newId: sequentialIds(),
    })
    expect(stubs).toEqual({})
    expect(cursors).toEqual({})
  })

  it("is deterministic per seed: same seed same stubs, and cull consumption is geometry-only", () => {
    const geometry = makeGeometry([
      makeZone("a", { templateKey: "hall" }),
      makeZone("b", { templateKey: "hall", position: { x: 600, y: 0 } }),
    ])
    const run = (seed: string) =>
      sproutStartStubs({
        state: makeMapInstanceState({ geometry }),
        set: set(),
        startingZoneIds: ["a"],
        seed,
        newId: sequentialIds(),
      })
    const first = run("seed-x")
    const second = run("seed-x")
    expect(second.stubs).toStrictEqual(first.stubs)
    // One draw per optional exit per bound zone, kept or culled: 2 bound zones
    // × 1 optional exit each = 2 templates draws, regardless of outcomes.
    expect(first.cursors).toEqual({ templates: 2 })
    expect(run("another-seed").cursors).toEqual({ templates: 2 })
  })

  it("a sprouted stub's anchor sits on the wall its bearing faces", () => {
    const geometry = makeGeometry([
      makeZone("a", { templateKey: "castle-entrance", size: "M" }),
    ])
    const { stubs } = sproutStartStubs({
      state: makeMapInstanceState({ geometry }),
      set: set(),
      startingZoneIds: ["a"],
      seed: "seed-x",
      newId: sequentialIds(),
    })
    for (const stub of Object.values(stubs)) {
      const dx = Math.cos(stub.bearing)
      const dy = Math.sin(stub.bearing)
      // The dominant ray direction must agree with the stored side (M is wider
      // than tall, so use the anchor's own axis, not raw dominance): an e/w
      // side implies the ray exits through a vertical wall (dx points that
      // way), n/s a horizontal one.
      if (stub.anchor.side === "e") expect(dx).toBeGreaterThan(0)
      if (stub.anchor.side === "w") expect(dx).toBeLessThan(0)
      if (stub.anchor.side === "s") expect(dy).toBeGreaterThan(0)
      if (stub.anchor.side === "n") expect(dy).toBeLessThan(0)
      expect(stub.anchor.offset).toBeGreaterThanOrEqual(0.05)
      expect(stub.anchor.offset).toBeLessThanOrEqual(0.95)
    }
  })

  it("starting zones under edge growth fan into the inward half-circle", () => {
    // Entrance at the top, site body below → inward is +y (screen-down).
    const geometry = makeGeometry([
      makeZone("a", {
        templateKey: "castle-entrance",
        position: { x: 0, y: 0 },
      }),
      makeZone("b", { position: { x: 0, y: 600 } }),
      makeZone("c", { position: { x: 400, y: 600 } }),
    ])
    const { stubs } = sproutStartStubs({
      state: makeMapInstanceState({ geometry }),
      set: set(),
      startingZoneIds: ["a"],
      seed: "seed-x",
      newId: sequentialIds(),
    })
    expect(Object.values(stubs)).toHaveLength(3)
    for (const stub of Object.values(stubs)) {
      // Every fanned bearing stays within the half-circle around inward (+y).
      expect(Math.sin(stub.bearing)).toBeGreaterThan(0)
    }
  })
})
