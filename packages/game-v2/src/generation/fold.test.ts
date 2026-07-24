import { describe, expect, it } from "vitest"

import {
  free,
  makeConnection,
  makeGenerationState,
  makeGeometry,
  makeMapInstanceState,
  makeZone,
} from "@workspace/game-v2/spatial/__fixtures__/spatial"
import type {
  GenerationState,
  MapInstanceState,
  RevealState,
} from "@workspace/game-v2/spatial/map-instance.schema"

import { applyStaticReveal, foldExpedition, type StaticReveal } from "./fold"

const SEED = "seed-map"

const foldStaticReveal = (input: {
  instance: MapInstanceState
  seedMapId: string
  prior: StaticReveal
}): StaticReveal =>
  foldExpedition({
    instance: input.instance,
    seedMapId: input.seedMapId,
    siteTemplateKeys: [],
    prior: {
      discoveredSiteKeys: [],
      staticReveal: input.prior,
    },
  }).staticReveal

/** An Instance over a–b–c (a connected to b, b connected to c), with the given
 *  provenance and reveal overlaid; every zone sits on the default page. */
const abcInstance = (
  zones: GenerationState["zones"],
  reveal: Partial<RevealState> = {}
): MapInstanceState =>
  makeMapInstanceState({
    geometry: makeGeometry(
      [makeZone("zone-a"), makeZone("zone-b"), makeZone("zone-c")],
      [
        makeConnection("conn-ab", "zone-a", "zone-b"),
        makeConnection("conn-bc", "zone-b", "zone-c"),
      ]
    ),
    generation: makeGenerationState({ zones }),
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
      ...reveal,
    },
  })

const allAuthored: GenerationState["zones"] = {
  "zone-a": { source: "authored", depth: 0 },
  "zone-b": { source: "authored", depth: 0 },
  "zone-c": { source: "authored", depth: 0 },
}

describe("foldExpedition", () => {
  it("passes prior through unchanged when nothing is revealed", () => {
    const prior: StaticReveal = {
      [SEED]: { zoneIds: ["zone-a"], connectionIds: ["conn-ab"] },
    }
    const result = foldStaticReveal({
      instance: abcInstance(allAuthored),
      seedMapId: SEED,
      prior,
    })

    expect(result).toEqual(prior)
  })

  it("folds an authored, revealed Zone to the seed Map", () => {
    const result = foldStaticReveal({
      instance: abcInstance(allAuthored, { revealedZoneIds: ["zone-a"] }),
      seedMapId: SEED,
      prior: {},
    })

    expect(result[SEED]?.zoneIds).toEqual(["zone-a"])
  })

  it("folds nothing when every revealed Zone is manual", () => {
    const result = foldStaticReveal({
      instance: abcInstance(
        {
          "zone-a": { source: "manual", depth: 0 },
          "zone-b": { source: "manual", depth: 0 },
          "zone-c": { source: "manual", depth: 0 },
        },
        { revealedZoneIds: ["zone-a", "zone-b", "zone-c"] }
      ),
      seedMapId: SEED,
      prior: {},
    })

    expect(result).toEqual({})
  })

  it("never folds a Zone with missing provenance (fail-safe under-fold)", () => {
    const result = foldStaticReveal({
      instance: abcInstance(
        { "zone-a": { source: "authored", depth: 0 } },
        { revealedZoneIds: ["zone-a", "zone-b"] }
      ),
      seedMapId: SEED,
      prior: {},
    })

    expect(result[SEED]?.zoneIds).toEqual(["zone-a"])
  })

  it("folds a revealed connection only when both endpoints are authored", () => {
    const bothAuthored = foldStaticReveal({
      instance: abcInstance(allAuthored, {
        revealedConnectionIds: ["conn-ab"],
      }),
      seedMapId: SEED,
      prior: {},
    })
    expect(bothAuthored[SEED]?.connectionIds).toEqual(["conn-ab"])

    const oneManual = foldStaticReveal({
      instance: abcInstance(
        {
          "zone-a": { source: "authored", depth: 0 },
          "zone-b": { source: "manual", depth: 0 },
          "zone-c": { source: "authored", depth: 0 },
        },
        { revealedConnectionIds: ["conn-ab"] }
      ),
      seedMapId: SEED,
      prior: {},
    })
    expect(oneManual[SEED]?.connectionIds ?? []).toEqual([])
  })

  it("never folds an unlocked connection — unlock is world state, not knowledge", () => {
    const result = foldStaticReveal({
      instance: abcInstance(allAuthored, {
        unlockedConnectionIds: ["conn-ab"],
      }),
      seedMapId: SEED,
      prior: {},
    })

    expect(result[SEED]?.connectionIds ?? []).toEqual([])
  })

  it("unions with prior, de-duplicating and preserving prior order", () => {
    const result = foldStaticReveal({
      instance: abcInstance(allAuthored, {
        revealedZoneIds: ["zone-a", "zone-c"],
      }),
      seedMapId: SEED,
      prior: { [SEED]: { zoneIds: ["zone-a"], connectionIds: [] } },
    })

    // zone-a already charted (kept, not duplicated); zone-c appended.
    expect(result[SEED]?.zoneIds).toEqual(["zone-a", "zone-c"])
  })

  it("is monotonic per source: the fold output never drops a prior id", () => {
    const prior: StaticReveal = {
      [SEED]: { zoneIds: ["gone-zone"], connectionIds: ["gone-conn"] },
      "other-map": { zoneIds: ["m1"], connectionIds: [] },
    }
    const result = foldStaticReveal({
      instance: abcInstance(allAuthored, { revealedZoneIds: ["zone-a"] }),
      seedMapId: SEED,
      prior,
    })

    expect(result[SEED]?.zoneIds).toEqual(["gone-zone", "zone-a"])
    expect(result[SEED]?.connectionIds).toEqual(["gone-conn"])
    // A source untouched this run passes through unchanged.
    expect(result["other-map"]).toEqual({ zoneIds: ["m1"], connectionIds: [] })
  })

  it("attributes a Zone on a grafted page to its source Map", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("zone-a"), makeZone("zone-g", { pageId: "grafted-page" })],
        []
      ),
      generation: makeGenerationState({
        zones: {
          "zone-a": { source: "authored", depth: 0 },
          "zone-g": { source: "authored", depth: 0 },
        },
        grafts: { "portal-map": { pageIds: ["grafted-page"] } },
      }),
      reveal: {
        revealedZoneIds: ["zone-a", "zone-g"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })

    const result = foldStaticReveal({
      instance,
      seedMapId: SEED,
      prior: {},
    })

    expect(result[SEED]?.zoneIds).toEqual(["zone-a"])
    expect(result["portal-map"]?.zoneIds).toEqual(["zone-g"])
  })
})

describe("foldExpedition discoveredSiteKeys", () => {
  it("folds revealed authored and generated sites, but no visit-scoped or unrelated space", () => {
    const instance = makeMapInstanceState({
      geometry: makeGeometry(
        [
          makeZone("authored", { templateKey: "authored-site" }),
          makeZone("generated", { templateKey: "generated-site" }),
          makeZone("manual", { templateKey: "manual-site" }),
          makeZone("hidden", { templateKey: "hidden-site" }),
          makeZone("ordinary", { templateKey: "ordinary-room" }),
          makeZone("missing-provenance", {
            templateKey: "missing-provenance-site",
          }),
        ],
        []
      ),
      generation: makeGenerationState({
        zones: {
          authored: {
            source: "authored",
            depth: 0,
            templateKey: "authored-site",
          },
          generated: {
            source: "generated",
            depth: 2,
            templateKey: "generated-site",
          },
          manual: {
            source: "manual",
            depth: 0,
            templateKey: "manual-site",
          },
          hidden: {
            source: "generated",
            depth: 3,
            templateKey: "hidden-site",
          },
          ordinary: {
            source: "generated",
            depth: 1,
            templateKey: "ordinary-room",
          },
        },
      }),
      reveal: {
        revealedZoneIds: [
          "authored",
          "generated",
          "manual",
          "ordinary",
          "missing-provenance",
          "stale-zone-id",
        ],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })

    const result = foldExpedition({
      instance,
      seedMapId: SEED,
      siteTemplateKeys: [
        "authored-site",
        "generated-site",
        "manual-site",
        "hidden-site",
        "missing-provenance-site",
      ],
      prior: {
        discoveredSiteKeys: ["stale-site", "authored-site"],
        staticReveal: {},
      },
    })

    expect(result.discoveredSiteKeys).toEqual([
      "stale-site",
      "authored-site",
      "generated-site",
    ])
  })
})

describe("applyStaticReveal", () => {
  const freshSeed = () =>
    makeMapInstanceState({
      geometry: makeGeometry(
        [makeZone("zone-a"), makeZone("zone-b")],
        [makeConnection("conn-ab", "zone-a", "zone-b")]
      ),
    })

  it("returns the same reference when no entry exists for the source Map", () => {
    const state = freshSeed()
    expect(applyStaticReveal(state, "unknown-map", {})).toBe(state)
  })

  it("returns the same reference when every surviving id is already revealed", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a")]),
      reveal: {
        revealedZoneIds: ["zone-a"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })
    expect(
      applyStaticReveal(state, SEED, {
        [SEED]: { zoneIds: ["zone-a"], connectionIds: [] },
      })
    ).toBe(state)
  })

  it("filters ids the author has since deleted, without throwing", () => {
    const next = applyStaticReveal(freshSeed(), SEED, {
      [SEED]: {
        zoneIds: ["zone-a", "ghost"],
        connectionIds: ["conn-ab", "ghost-conn"],
      },
    })

    expect(next.reveal.revealedZoneIds).toEqual(["zone-a"])
    expect(next.reveal.revealedConnectionIds).toEqual(["conn-ab"])
  })

  it("unions onto existing reveal instead of replacing it", () => {
    const state = makeMapInstanceState({
      geometry: makeGeometry([makeZone("zone-a"), makeZone("zone-b")]),
      occupancy: { c0: free("zone-b") },
      reveal: {
        revealedZoneIds: ["zone-b"],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    })

    const next = applyStaticReveal(state, SEED, {
      [SEED]: { zoneIds: ["zone-a"], connectionIds: [] },
    })

    expect(next.reveal.revealedZoneIds).toEqual(["zone-b", "zone-a"])
    // Non-reveal state is untouched.
    expect(next.occupancy).toEqual(state.occupancy)
  })
})
