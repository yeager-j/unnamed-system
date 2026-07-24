import { describe, expect, it } from "vitest"

import {
  makeGenerationState,
  makeMapInstanceState,
  makeZone,
} from "../spatial/__fixtures__/spatial"
import { emptyGenerationLedger } from "../spatial/generation-ledger.schema"
import type { MapInstanceState } from "../spatial/map-instance.schema"
import { DEFAULT_SPACING } from "./layout"
import { makeStream } from "./rng"
import { rollExpansion, type ExpansionDeps } from "./roll-expansion"
import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "./template-set.schema"

/**
 * Branch-level examples for the roller (UNN-642). The laws quantify the
 * invariants; these pin each decision point with a readable fixture. The
 * fixtures steer randomness through the *real* streams — `closureChance` 0/1
 * forbids/forces closure, a one-template pool forces the pick — never by
 * mocking the RNG (D1: tests control seed, cursors, and the set).
 */

/** A set where every template accepts every other (universal "hub" tag). */
const makeSet = (
  overrides: Partial<Record<string, object>> = {},
  setOverrides: object = {}
): TemplateSetContent =>
  templateSetContentSchema.parse({
    templates: {
      hall: {
        key: "hall",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 1,
        exits: [{ optional: false }, { optional: false }],
        ...overrides["hall"],
      },
      vault: {
        key: "vault",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 0,
        ...overrides["vault"],
      },
      ...Object.fromEntries(
        Object.entries(overrides).filter(
          ([key]) => key !== "hall" && key !== "vault"
        )
      ),
    },
    closureChance: 0,
    ...setOverrides,
  })

/** An entry zone bound to "hall" with one open stub pointing east. */
const makeInstance = (
  overrides: Partial<MapInstanceState> = {}
): MapInstanceState =>
  makeMapInstanceState({
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {
        entry: makeZone("entry", {
          templateKey: "hall",
          position: { x: 0, y: 0 },
        }),
      },
      connections: {},
    },
    generation: makeGenerationState({
      zones: { entry: { source: "authored", depth: 0 } },
      stubs: {
        "stub-1": {
          id: "stub-1",
          zoneId: "entry",
          bearing: 0,
          anchor: { side: "e", offset: 0.5 },
        },
      },
      startingZoneIds: ["entry"],
    }),
    ...overrides,
  })

const deps = (over: Partial<ExpansionDeps> = {}): ExpansionDeps => {
  let counter = 0
  return {
    set: makeSet(),
    instanceState: makeInstance(),
    ledger: { ...emptyGenerationLedger(), seed: "test-seed" },
    stubId: "stub-1",
    newId: () => `id-${counter++}`,
    ...over,
  }
}

const expectSingle = <T>(items: T[]): T => {
  expect(items).toHaveLength(1)
  return items[0]!
}

describe("rollExpansion — context resolution", () => {
  it("errs unknown-stub for an absent stub (the executor screens the benign case first)", () => {
    expect(rollExpansion(deps({ stubId: "nope" }))).toStrictEqual({
      ok: false,
      error: "unknown-stub",
    })
  })

  it("errs unknown-parent-zone when the stub's zone dangles", () => {
    const instanceState = makeInstance()
    instanceState.generation.stubs["stub-1"]!.zoneId = "gone"
    expect(rollExpansion(deps({ instanceState }))).toStrictEqual({
      ok: false,
      error: "unknown-parent-zone",
    })
  })
})

describe("rollExpansion — the mint outcome", () => {
  it("mints a legal template: zone + connection(id := stubId) + provenance + turn + record + cursors", () => {
    const result = rollExpansion(deps())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const mint = expectSingle(result.value.instanceEvents)
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    expect(mint.stubId).toBe("stub-1")
    expect(mint.connectionId).toBe("stub-1")
    expect(mint.zone.templateKey).toBe("hall")
    expect(mint.zone.name).toBe("hall")
    expect(mint.zone.pageId).toBe("default")
    expect(mint.zone.size).toBeUndefined()
    expect(mint.provenance).toStrictEqual({
      source: "generated",
      templateKey: "hall",
      depth: 1,
    })
    // hall has two non-optional exits; the incoming connection debits one.
    expect(mint.stubs).toHaveLength(1)
    expect(mint.stubs[0]!.zoneId).toBe(mint.zone.id)

    expect(result.value.dungeonEvents.map((event) => event.kind)).toEqual([
      "advanceTurn",
      "recordMint",
      "advanceCursors",
    ])
    const recordEvent = result.value.dungeonEvents[1]!
    if (recordEvent.kind !== "recordMint") throw new Error("no record")
    expect(recordEvent.zoneId).toBe(mint.zone.id)
    expect(recordEvent.record).toStrictEqual({
      sequence: 0,
      templateKey: "hall",
      unique: false,
      stub: {
        id: "stub-1",
        zoneId: "entry",
        bearing: 0,
        anchor: { side: "e", offset: 0.5 },
      },
      childStubIds: [mint.stubs[0]!.id],
      effects: [],
    })
    const cursors = result.value.dungeonEvents[2]!
    if (cursors.kind !== "advanceCursors") throw new Error("no cursors")
    // Closure draw + pick draw (no optional exits) + one layout draw per child
    // exit fanned (hall's two non-optional exits − the incoming = one child).
    expect(cursors.consumed).toStrictEqual({
      closure: 1,
      templates: 1,
      layout: mint.stubs.length,
    })
    expect(mint.stubs.length).toBe(1)
  })

  it("excludes weight-0, tombstoned, spent-unique, and socket-illegal templates from the pool", () => {
    // Only "hall" mintable: vault is weight-0; crypt tombstoned; relic unique +
    // spent; oubliette socket-illegal (accepts nothing hall's tags satisfy).
    const set = makeSet({
      crypt: {
        key: "crypt",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 9,
        tombstoned: true,
      },
      relic: {
        key: "relic",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 9,
        unique: true,
      },
      oubliette: {
        key: "oubliette",
        tags: ["pit"],
        accepts: ["pit"],
        weight: 9,
      },
    })
    const ledger = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      mintedUniqueKeys: ["relic"],
    }
    const result = rollExpansion(deps({ set, ledger }))
    if (!result.ok) throw new Error(result.error)
    const mint = expectSingle(result.value.instanceEvents)
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    expect(mint.zone.templateKey).toBe("hall")
  })

  it("walks templateOrder, not record key order (jsonb-order regression)", () => {
    // Two identical-weight templates; reordering the record keys while keeping
    // templateOrder fixed must not change the pick.
    const base = {
      tags: ["hub"],
      accepts: ["hub"],
      weight: 1,
    }
    const forward = templateSetContentSchema.parse({
      templates: {
        hall: { key: "hall", ...base },
        alpha: { key: "alpha", ...base },
        omega: { key: "omega", ...base },
      },
      templateOrder: ["hall", "alpha", "omega"],
      closureChance: 0,
    })
    const reversed = templateSetContentSchema.parse({
      templates: {
        omega: { key: "omega", ...base },
        alpha: { key: "alpha", ...base },
        hall: { key: "hall", ...base },
      },
      templateOrder: ["hall", "alpha", "omega"],
      closureChance: 0,
    })
    const a = rollExpansion(deps({ set: forward }))
    const b = rollExpansion(deps({ set: reversed }))
    expect(a).toStrictEqual(b)
  })

  it("consumes one templates draw per optional exit of the minted template", () => {
    const set = makeSet({
      hall: {
        key: "hall",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 1,
        exits: [
          { optional: false },
          { optional: true },
          { optional: true },
          { optional: true },
        ],
      },
    })
    const result = rollExpansion(deps({ set }))
    if (!result.ok) throw new Error(result.error)
    const mint = result.value.instanceEvents[0]!
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    const cursors = result.value.dungeonEvents.at(-1)!
    if (cursors.kind !== "advanceCursors") throw new Error("no cursors")
    // 1 pick + 3 optional-exit culls (templates), one layout draw per child.
    expect(cursors.consumed).toStrictEqual({
      closure: 1,
      templates: 4,
      layout: mint.stubs.length,
    })
  })

  it("withdraws a pending site until due, then overrides weight and sockets", () => {
    const set = makeSet({
      vault: {
        key: "vault",
        tags: ["sealed"],
        accepts: [],
        weight: 100,
        unique: true,
      },
    })
    const waiting = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      declarations: [
        {
          id: "decl",
          sequence: 0,
          templateKey: "vault",
          minDepth: 0,
          k: 6,
          secretIndex: 2,
          qualifyingCount: 0,
        },
      ],
    }
    const beforeDue = rollExpansion(deps({ set, ledger: waiting }))
    if (!beforeDue.ok) throw new Error(beforeDue.error)
    const randomMint = beforeDue.value.instanceEvents[0]!
    if (randomMint.kind !== "mintZone") throw new Error(randomMint.kind)
    expect(randomMint.zone.templateKey).toBe("hall")

    const due = {
      ...waiting,
      declarations: [{ ...waiting.declarations[0]!, qualifyingCount: 1 }],
    }
    const result = rollExpansion(deps({ set, ledger: due }))
    if (!result.ok) throw new Error(result.error)
    const mint = result.value.instanceEvents[0]!
    if (mint.kind !== "mintZone") throw new Error(mint.kind)
    expect(mint.zone.templateKey).toBe("vault")
    const record = result.value.dungeonEvents.find(
      (event) => event.kind === "recordMint"
    )
    if (record?.kind !== "recordMint") throw new Error("missing record")
    expect(record.record.effects).toStrictEqual([
      { declarationId: "decl", incremented: true, resolved: true },
    ])
  })

  it("resolves a durable tombstoned declaration and gives K=1 collision priority", () => {
    const set = makeSet({
      vault: {
        key: "vault",
        tags: [],
        accepts: [],
        weight: 0,
        unique: true,
        tombstoned: true,
      },
      shrine: {
        key: "shrine",
        tags: [],
        accepts: [],
        weight: 0,
        unique: true,
      },
    })
    const ledger = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      declarations: [
        {
          id: "ordinary",
          sequence: 0,
          templateKey: "shrine",
          minDepth: 0,
          k: 6,
          secretIndex: 1,
          qualifyingCount: 0,
        },
        {
          id: "force",
          sequence: 1,
          templateKey: "vault",
          minDepth: 0,
          k: 1,
          secretIndex: 1,
          qualifyingCount: 0,
        },
      ],
    }
    const result = rollExpansion(deps({ set, ledger }))
    if (!result.ok) throw new Error(result.error)
    const mint = result.value.instanceEvents[0]!
    if (mint.kind !== "mintZone") throw new Error(mint.kind)
    expect(mint.zone.templateKey).toBe("vault")
    const record = result.value.dungeonEvents.find(
      (event) => event.kind === "recordMint"
    )
    if (record?.kind !== "recordMint") throw new Error("missing record")
    expect(record.record.effects).toStrictEqual([
      { declarationId: "ordinary", incremented: true, resolved: false },
      { declarationId: "force", incremented: true, resolved: true },
    ])
  })

  it("fails rather than silently skipping a missing due declaration target", () => {
    const ledger = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      declarations: [
        {
          id: "gone",
          sequence: 0,
          templateKey: "missing",
          minDepth: 0,
          k: 1,
          secretIndex: 1,
          qualifyingCount: 0,
        },
      ],
    }
    expect(rollExpansion(deps({ ledger }))).toStrictEqual({
      ok: false,
      error: "scheduled-template-unavailable",
    })
  })
})

describe("rollExpansion — loop closure", () => {
  const withNeighbor = (): MapInstanceState =>
    makeInstance({
      geometry: {
        pages: { default: { id: "default", name: "Page 1" } },
        zones: {
          entry: makeZone("entry", {
            templateKey: "hall",
            position: { x: 0, y: 0 },
          }),
          near: makeZone("near", {
            templateKey: "hall",
            position: { x: DEFAULT_SPACING, y: 120 },
          }),
        },
        connections: {},
      },
      generation: makeGenerationState({
        zones: {
          entry: { source: "authored", depth: 0 },
          near: { source: "authored", depth: 1 },
        },
        stubs: {
          "stub-1": {
            id: "stub-1",
            zoneId: "entry",
            bearing: 0,
            anchor: { side: "e", offset: 0.5 },
          },
        },
        startingZoneIds: ["entry"],
      }),
    })

  it("closes a loop at closureChance 1: connection to the candidate, cursors only, no turn", () => {
    const result = rollExpansion(
      deps({
        set: makeSet({}, { closureChance: 1 }),
        instanceState: withNeighbor(),
        ledger: {
          ...emptyGenerationLedger(),
          seed: "test-seed",
          declarations: [
            {
              id: "due-site",
              sequence: 0,
              templateKey: "vault",
              minDepth: 0,
              k: 1,
              secretIndex: 1,
              qualifyingCount: 0,
            },
          ],
        },
      })
    )
    if (!result.ok) throw new Error(result.error)
    const close = expectSingle(result.value.instanceEvents)
    if (close.kind !== "closeLoop") throw new Error(`got ${close.kind}`)
    expect(close).toStrictEqual({
      kind: "closeLoop",
      stubId: "stub-1",
      connectionId: "stub-1",
      toZoneId: "near",
    })
    expect(result.value.dungeonEvents).toStrictEqual([
      { kind: "advanceCursors", consumed: { closure: 1 } },
    ])
  })

  it("never closes at closureChance 0", () => {
    const result = rollExpansion(
      deps({ instanceState: withNeighbor(), set: makeSet() })
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents[0]!.kind).toBe("mintZone")
  })

  it("falls through to mint when closure fires but no candidate stands", () => {
    // closureChance 1 but no near zone — the roll fires, finds nothing, mints.
    const result = rollExpansion(
      deps({ set: makeSet({}, { closureChance: 1 }) })
    )
    if (!result.ok) throw new Error(result.error)
    const mint = result.value.instanceEvents[0]!
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    const cursors = result.value.dungeonEvents.at(-1)!
    if (cursors.kind !== "advanceCursors") throw new Error("no cursors")
    expect(cursors.consumed).toStrictEqual({
      closure: 1,
      templates: 1,
      layout: mint.stubs.length,
    })
  })

  it("skips a socket-illegal closure candidate", () => {
    const instanceState = withNeighbor()
    instanceState.geometry.zones["near"]!.templateKey = "oubliette"
    const set = makeSet(
      {
        oubliette: {
          key: "oubliette",
          tags: ["pit"],
          accepts: ["pit"],
          weight: 1,
        },
      },
      { closureChance: 1 }
    )
    const result = rollExpansion(deps({ set, instanceState }))
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents[0]!.kind).toBe("mintZone")
  })
})

describe("rollExpansion — empty pool: connector fallback, then dead end", () => {
  const noPoolSet = (setOverrides: object = {}): TemplateSetContent =>
    // The parent's template accepts only "gate"; nothing weighted carries it,
    // so the random pool is empty. The connector (when designated) does.
    templateSetContentSchema.parse({
      templates: {
        hall: { key: "hall", tags: ["hub"], accepts: ["gate"], weight: 1 },
        passage: {
          key: "passage",
          tags: ["gate"],
          accepts: ["hub"],
          weight: 0,
        },
      },
      closureChance: 0,
      ...setOverrides,
    })

  it("mints the connector on an empty pool (recordMint included — the shared emitter)", () => {
    const result = rollExpansion(
      deps({ set: noPoolSet({ connectorTemplateKey: "passage" }) })
    )
    if (!result.ok) throw new Error(result.error)
    const mint = expectSingle(result.value.instanceEvents)
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    expect(mint.zone.templateKey).toBe("passage")
    expect(result.value.dungeonEvents.map((event) => event.kind)).toEqual([
      "advanceTurn",
      "recordMint",
      "advanceCursors",
    ])
    const cursors = result.value.dungeonEvents.at(-1)!
    if (cursors.kind !== "advanceCursors") throw new Error("no cursors")
    // Connector fallback consumes no pick draw; passage has no optional exits.
    expect(cursors.consumed).toStrictEqual({ closure: 1 })
  })

  it("resolves a dead end when no connector is designated", () => {
    const result = rollExpansion(deps({ set: noPoolSet() }))
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents).toStrictEqual([
      { kind: "resolveDeadEnd", stubId: "stub-1" },
    ])
    expect(result.value.dungeonEvents).toStrictEqual([
      { kind: "advanceCursors", consumed: { closure: 1 } },
    ])
  })

  it("resolves a dead end when the connector is socket-illegal beside the parent", () => {
    const result = rollExpansion(
      deps({
        set: templateSetContentSchema.parse({
          templates: {
            hall: { key: "hall", tags: ["hub"], accepts: ["gate"], weight: 1 },
            passage: {
              key: "passage",
              tags: ["gate"],
              accepts: ["pit"],
              weight: 0,
            },
          },
          connectorTemplateKey: "passage",
          closureChance: 0,
        }),
      })
    )
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents[0]!.kind).toBe("resolveDeadEnd")
  })

  it("resolves a dead end for an unbound parent zone (graceful blob-boundary degradation)", () => {
    const instanceState = makeInstance()
    delete instanceState.geometry.zones["entry"]!.templateKey
    const result = rollExpansion(deps({ instanceState }))
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents[0]!.kind).toBe("resolveDeadEnd")
  })
})

describe("rollExpansion — no-space", () => {
  /** Edge growth with the stub's bearing pointing dead against the half-plane:
   *  every layout candidate lands behind the boundary. */
  const noSpaceInstance = (): MapInstanceState => {
    const instanceState = makeInstance({
      geometry: {
        pages: { default: { id: "default", name: "Page 1" } },
        zones: {
          entry: makeZone("entry", {
            templateKey: "hall",
            position: { x: 0, y: 0 },
          }),
          deeper: makeZone("deeper", {
            templateKey: "hall",
            position: { x: 600, y: 0 },
          }),
        },
        connections: {},
      },
      generation: makeGenerationState({
        zones: {
          entry: { source: "authored", depth: 0 },
          deeper: { source: "authored", depth: 1 },
        },
        stubs: {
          "stub-1": {
            id: "stub-1",
            zoneId: "entry",
            // Inward is +x (entry → deeper); this stub points -x, out of the
            // half-plane, and every nudge stays behind the boundary.
            bearing: Math.PI,
            anchor: { side: "w", offset: 0.5 },
          },
        },
        startingZoneIds: ["entry"],
      }),
    })
    return instanceState
  }

  it("random path: an exhausted layout search resolves as a dead end, never a dead click", () => {
    const result = rollExpansion(deps({ instanceState: noSpaceInstance() }))
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents).toStrictEqual([
      { kind: "resolveDeadEnd", stubId: "stub-1" },
    ])
    const cursors = result.value.dungeonEvents.at(-1)!
    if (cursors.kind !== "advanceCursors") throw new Error("no cursors")
    // The pick draw was consumed before layout failed.
    expect(cursors.consumed).toStrictEqual({ closure: 1, templates: 1 })
  })

  it("forced path: surfaces err(no-space) and consumes the stub in no way", () => {
    const result = rollExpansion(deps({ instanceState: noSpaceInstance() }), {
      forcedTemplateKey: "hall",
    })
    expect(result).toStrictEqual({ ok: false, error: "no-space" })
  })
})

describe("rollExpansion — force-pick", () => {
  it("mints the named template with no closure or pick draws (identical emitter)", () => {
    const set = makeSet({
      relic: {
        key: "relic",
        tags: ["hub"],
        accepts: ["hub"],
        weight: 0,
        unique: true,
        exits: [{ optional: false }],
      },
    })
    const result = rollExpansion(deps({ set }), { forcedTemplateKey: "relic" })
    if (!result.ok) throw new Error(result.error)
    const mint = expectSingle(result.value.instanceEvents)
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    expect(mint.zone.templateKey).toBe("relic")
    // One non-optional exit − the incoming connection = zero child stubs, and
    // no optional exits ⇒ nothing consumed ⇒ advanceCursors omitted entirely.
    expect(result.value.dungeonEvents.map((event) => event.kind)).toEqual([
      "advanceTurn",
      "recordMint",
    ])
    const recordEvent = result.value.dungeonEvents[1]!
    if (recordEvent.kind !== "recordMint") throw new Error("no record")
    expect(recordEvent.record.unique).toBe(true)
  })

  it("overrides weights and sockets but refuses unknown / tombstoned / spent-unique", () => {
    const set = makeSet({
      crypt: {
        key: "crypt",
        tags: ["pit"],
        accepts: ["pit"],
        weight: 0,
      },
      buried: {
        key: "buried",
        tags: ["hub"],
        accepts: ["hub"],
        tombstoned: true,
      },
      relic: { key: "relic", tags: ["hub"], accepts: ["hub"], unique: true },
    })
    // Socket-illegal + weight-0: still mints (the DM's declaration).
    const forced = rollExpansion(deps({ set }), { forcedTemplateKey: "crypt" })
    if (!forced.ok) throw new Error(forced.error)
    expect(forced.value.instanceEvents[0]!.kind).toBe("mintZone")

    expect(
      rollExpansion(deps({ set }), { forcedTemplateKey: "nope" })
    ).toStrictEqual({ ok: false, error: "unknown-template" })
    expect(
      rollExpansion(deps({ set }), { forcedTemplateKey: "buried" })
    ).toStrictEqual({ ok: false, error: "template-tombstoned" })
    const ledger = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      mintedUniqueKeys: ["relic"],
    }
    expect(
      rollExpansion(deps({ set, ledger }), { forcedTemplateKey: "relic" })
    ).toStrictEqual({ ok: false, error: "unique-already-minted" })
  })
})

describe("rollExpansion — stream resume", () => {
  it("opens streams at the ledger cursors (a pre-advanced ledger continues the sequence)", () => {
    // Draw the templates stream 3 deep by hand, then hand the roller a ledger
    // whose cursor already sits at 3 — its pick draw must equal draw #4.
    const stream = makeStream("test-seed", "templates")
    stream.next()
    stream.next()
    stream.next()
    const expected = stream.next()

    const ledger = {
      ...emptyGenerationLedger(),
      seed: "test-seed",
      streamCursors: { templates: 3 },
    }
    // Two equal-weight templates: the pick reveals which half the draw fell in.
    const base = { tags: ["hub"], accepts: ["hub"], weight: 1 }
    const set = templateSetContentSchema.parse({
      templates: {
        hall: { key: "hall", ...base },
        alpha: { key: "alpha", ...base },
      },
      closureChance: 0,
    })
    const result = rollExpansion(deps({ set, ledger }))
    if (!result.ok) throw new Error(result.error)
    const mint = result.value.instanceEvents[0]!
    if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)
    expect(mint.zone.templateKey).toBe(expected < 0.5 ? "hall" : "alpha")
  })
})
