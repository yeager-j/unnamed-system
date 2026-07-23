import { describe, expect, it } from "vitest"

// The test-side mirror of the roller's own fixtures: an entry zone bound to
// "hall" with one open stub. Kept local (not shared) so each file's fixture
// reads self-contained.
import {
  makeMapInstanceState,
  makeZone,
  reduceInstance,
} from "../spatial/__fixtures__/spatial"
import { createDungeonState } from "../spatial/dungeon.schema"
import {
  emptyGenerationLedger,
  type GenerationLedger,
} from "../spatial/generation-ledger.schema"
import type { MapInstanceState } from "../spatial/map-instance.schema"
import { reduceDungeon } from "../spatial/reduce-dungeon"
import { buildRetraction } from "./retract"
import { rollExpansion, type ExpansionDeps } from "./roll-expansion"
import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "./template-set.schema"

const set: TemplateSetContent = templateSetContentSchema.parse({
  templates: {
    hall: {
      key: "hall",
      tags: ["hub"],
      accepts: ["hub"],
      weight: 1,
      exits: [{ optional: false }, { optional: false }, { optional: false }],
    },
  },
  closureChance: 0,
})

const baseInstance = (): MapInstanceState =>
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
    generation: {
      zones: { entry: { source: "authored", depth: 0 } },
      stubs: {
        "stub-1": {
          id: "stub-1",
          zoneId: "entry",
          bearing: 0,
          anchor: { side: "e", offset: 0.5 },
        },
      },
      connections: {},
      grafts: {},
      startingZoneIds: ["entry"],
    },
  })

/** Rolls a real mint through the real roller + reducers and returns the
 *  post-mint world — the honest fixture every retract test starts from. */
function mintedWorld(): {
  instanceState: MapInstanceState
  ledger: GenerationLedger
  zoneId: string
  childStubIds: string[]
} {
  let counter = 0
  const deps: ExpansionDeps = {
    set,
    instanceState: baseInstance(),
    ledger: { ...emptyGenerationLedger(), seed: "retract-seed" },
    stubId: "stub-1",
    newId: () => `minted-${counter++}`,
  }
  const rolled = rollExpansion(deps)
  if (!rolled.ok) throw new Error(rolled.error)
  const mint = rolled.value.instanceEvents[0]!
  if (mint.kind !== "mintZone") throw new Error(`got ${mint.kind}`)

  let instanceState = deps.instanceState
  for (const event of rolled.value.instanceEvents) {
    instanceState = reduceInstance(instanceState, event)
  }
  let dungeon = { ...createDungeonState(), generation: deps.ledger }
  for (const event of rolled.value.dungeonEvents) {
    dungeon = reduceDungeon(dungeon, event)
  }
  return {
    instanceState,
    ledger: dungeon.generation,
    zoneId: mint.zone.id,
    childStubIds: mint.stubs.map((stub) => stub.id),
  }
}

describe("buildRetraction — the paired inverse", () => {
  it("emits retractZone (restoredStub byte-identical to the pre-mint stub) + revertMint", () => {
    const world = mintedWorld()
    const result = buildRetraction({
      instanceState: world.instanceState,
      ledger: world.ledger,
      zoneId: world.zoneId,
    })
    if (!result.ok) throw new Error(result.error)
    expect(result.value.instanceEvents).toStrictEqual([
      {
        kind: "retractZone",
        zoneId: world.zoneId,
        restoredStub: {
          id: "stub-1",
          zoneId: "entry",
          bearing: 0,
          anchor: { side: "e", offset: 0.5 },
        },
      },
    ])
    expect(result.value.dungeonEvents).toStrictEqual([
      { kind: "revertMint", zoneId: world.zoneId },
    ])
  })

  it("round-trips: folding the retraction restores the pre-mint instance state exactly", () => {
    const world = mintedWorld()
    const result = buildRetraction({
      instanceState: world.instanceState,
      ledger: world.ledger,
      zoneId: world.zoneId,
    })
    if (!result.ok) throw new Error(result.error)
    let restored = world.instanceState
    for (const event of result.value.instanceEvents) {
      restored = reduceInstance(restored, event)
    }
    expect(restored).toStrictEqual(baseInstance())
  })
})

describe("buildRetraction — refusals", () => {
  it("unknown-zone for an absent zone (the executor screens the benign case first)", () => {
    const world = mintedWorld()
    expect(buildRetraction({ ...world, zoneId: "nope" })).toStrictEqual({
      ok: false,
      error: "unknown-zone",
    })
  })

  it("not-generated for an authored zone", () => {
    const world = mintedWorld()
    expect(buildRetraction({ ...world, zoneId: "entry" })).toStrictEqual({
      ok: false,
      error: "not-generated",
    })
  })

  it("no-mint-record when the record is gone (corrupt state, defensive)", () => {
    const world = mintedWorld()
    const ledger = { ...world.ledger, mints: {} }
    expect(buildRetraction({ ...world, ledger })).toStrictEqual({
      ok: false,
      error: "no-mint-record",
    })
  })

  it("revealed once players have seen the zone", () => {
    const world = mintedWorld()
    const instanceState = {
      ...world.instanceState,
      reveal: {
        ...world.instanceState.reveal,
        revealedZoneIds: [world.zoneId],
      },
    }
    expect(buildRetraction({ ...world, instanceState })).toStrictEqual({
      ok: false,
      error: "revealed",
    })
  })

  it("occupied when any token stands in the zone (either occupancy lifecycle)", () => {
    const world = mintedWorld()
    const instanceState = {
      ...world.instanceState,
      occupancy: {
        "char-1": {
          zoneId: world.zoneId,
          engagement: { status: "free" as const },
        },
      },
    }
    expect(buildRetraction({ ...world, instanceState })).toStrictEqual({
      ok: false,
      error: "occupied",
    })
  })

  it("not-leaf when a child stub was consumed — even by a dead end (strict, doc-literal)", () => {
    const world = mintedWorld()
    expect(world.childStubIds.length).toBeGreaterThan(0)
    const instanceState = reduceInstance(world.instanceState, {
      kind: "resolveDeadEnd",
      stubId: world.childStubIds[0]!,
    })
    expect(buildRetraction({ ...world, instanceState })).toStrictEqual({
      ok: false,
      error: "not-leaf",
    })
  })

  it("not-leaf when a closure landed on the zone from elsewhere", () => {
    const world = mintedWorld()
    // Another zone's stub closed a loop into the minted zone: a non-entry
    // connection now touches it, and retract would destroy that stub's exit.
    const instanceState = {
      ...world.instanceState,
      geometry: {
        ...world.instanceState.geometry,
        connections: {
          ...world.instanceState.geometry.connections,
          "other-stub": {
            id: "other-stub",
            fromZoneId: "entry",
            toZoneId: world.zoneId,
            hidden: false,
            locked: false,
          },
        },
      },
    }
    expect(buildRetraction({ ...world, instanceState })).toStrictEqual({
      ok: false,
      error: "not-leaf",
    })
  })
})
