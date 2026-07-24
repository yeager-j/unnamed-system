import { describe, expect, it } from "vitest"

import {
  makeGenerationState,
  makeMapInstanceState,
} from "../spatial/__fixtures__/spatial"
import { rectOfZone, rectsOverlap } from "../spatial/footprints"
import { emptyGenerationLedger } from "../spatial/generation-ledger.schema"
import type { MapInstanceState } from "../spatial/map-instance.schema"
import { pageSpacing } from "./layout"
import { pairLegal } from "./lint"
import { pregenerateExpedition } from "./pregenerate"
import { sproutStartStubs } from "./start"
import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "./template-set.schema"

// A branching set (all one tag, so adjacency never limits growth) — the shape
// a real pre-generated region grows from.
const set: TemplateSetContent = templateSetContentSchema.parse({
  templates: {
    junction: {
      key: "junction",
      tags: ["street"],
      accepts: ["street"],
      weight: 2,
      exits: [
        { optional: false },
        { optional: false },
        { optional: false },
        { optional: true },
      ],
    },
    hall: {
      key: "hall",
      tags: ["street"],
      accepts: ["street"],
      weight: 3,
      exits: [{ optional: false }, { optional: true }, { optional: true }],
    },
    vault: {
      key: "vault",
      tags: ["street"],
      accepts: ["street"],
      weight: 1,
      exits: [{ optional: false }],
    },
  },
  connectorTemplateKey: "hall",
  closureChance: 0.12,
})

/** A one-zone seed instance whose Entry is bound to a set template, with the
 *  start-stubs already sprouted — the input `executeStart` hands pre-gen. */
function seeded(seed: string): {
  instanceState: MapInstanceState
  ledger: ReturnType<typeof emptyGenerationLedger>
} {
  const base = makeMapInstanceState({
    geometry: {
      pages: { default: { id: "default", name: "P" } },
      zones: {
        entry: {
          id: "entry",
          name: "Entry",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: "default",
          templateKey: "junction",
        },
      },
      connections: {},
    },
    generation: makeGenerationState({
      zones: { entry: { source: "authored", depth: 0 } },
      startingZoneIds: ["entry"],
    }),
  })
  let counter = 0
  const { stubs, cursors } = sproutStartStubs({
    state: base,
    set,
    startingZoneIds: ["entry"],
    seed,
    newId: () => `start-${counter++}`,
  })
  return {
    instanceState: {
      ...base,
      generation: { ...base.generation, stubs },
    },
    ledger: { ...emptyGenerationLedger(), seed, streamCursors: cursors },
  }
}

const counterIds = (prefix: string) => {
  let n = 0
  return () => `${prefix}-${n++}`
}

function unwrapPregen(result: ReturnType<typeof pregenerateExpedition>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe("pregenerateExpedition", () => {
  it("carves to the depth limit, stamps no zone deeper, and leaves the outer ring's frontier open", () => {
    const { instanceState, ledger } = seeded("pregen-seed")
    const maxDepth = 5
    const result = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState,
        ledger,
        maxDepth,
        newId: counterIds("z"),
      })
    )

    const state = result.instanceState
    const zoneCount = Object.keys(state.geometry.zones).length
    expect(zoneCount).toBeGreaterThan(1)
    // No zone is deeper than the limit, and the map actually reached it.
    const depths = Object.values(state.generation.zones).map(
      (provenance) => provenance.depth
    )
    expect(Math.max(...depths)).toBe(maxDepth)
    // The frontier stays open (hybrid): the DM can expand further live, and
    // every open stub hangs off a max-depth zone — the outermost ring, the
    // only rooms whose exits pre-gen left uncarved.
    const openStubs = Object.values(state.generation.stubs)
    expect(openStubs.length).toBeGreaterThan(0)
    for (const stub of openStubs) {
      expect(state.generation.zones[stub.zoneId]?.depth).toBe(maxDepth)
    }
    // Every carved zone recorded a mint (retract still works at prep).
    const generated = Object.entries(
      result.instanceState.generation.zones
    ).filter(([, provenance]) => provenance.source === "generated")
    expect(generated.length).toBe(zoneCount - 1) // all but the authored Entry
    for (const [zoneId] of generated) {
      expect(result.ledger.mints[zoneId]).toBeDefined()
    }
  })

  it("under the zone cap, seals interior stubs so no below-depth passage stays open", () => {
    // A hyper-branching set + a deep limit blows past PREGEN_MAX_ZONES before
    // the depth limit is reached, so the carve stops mid-map. The seal pass
    // must leave no interior (below-max-depth) stub open — those would be
    // free-carve passages that wrongly cost turns to finish live.
    const branchy = templateSetContentSchema.parse({
      templates: {
        fork: {
          key: "fork",
          tags: ["x"],
          accepts: ["x"],
          weight: 1,
          exits: Array.from({ length: 6 }, () => ({ optional: false })),
        },
      },
      connectorTemplateKey: "fork",
      closureChance: 0,
    })
    const base = makeMapInstanceState({
      geometry: {
        pages: { default: { id: "default", name: "P" } },
        zones: {
          entry: {
            id: "entry",
            name: "Entry",
            description: "",
            dmNotes: "",
            position: { x: 0, y: 0 },
            pageId: "default",
            templateKey: "fork",
          },
        },
        connections: {},
      },
      generation: makeGenerationState({
        zones: { entry: { source: "authored", depth: 0 } },
        startingZoneIds: ["entry"],
      }),
    })
    let counter = 0
    const { stubs, cursors } = sproutStartStubs({
      state: base,
      set: branchy,
      startingZoneIds: ["entry"],
      seed: "cap-seed",
      newId: () => `start-${counter++}`,
    })
    const { instanceState: grown } = unwrapPregen(
      pregenerateExpedition({
        set: branchy,
        instanceState: { ...base, generation: { ...base.generation, stubs } },
        ledger: {
          ...emptyGenerationLedger(),
          seed: "cap-seed",
          streamCursors: cursors,
        },
        maxDepth: 20,
        newId: counterIds("z"),
      })
    )

    // The cap bounded the map well short of the depth limit.
    const maxSeen = Math.max(
      ...Object.values(grown.generation.zones).map((p) => p.depth)
    )
    expect(Object.keys(grown.geometry.zones).length).toBeGreaterThan(100)
    expect(maxSeen).toBeLessThan(20)
    // Nothing reached the intended depth, so every stub is interior → all
    // sealed: a capped map is complete, with no below-depth passage left open.
    expect(grown.generation.stubs).toEqual({})
  })

  it("never overlaps footprints and keeps every mint adjacency-legal", () => {
    const { instanceState, ledger } = seeded("pregen-seed")
    const { instanceState: grown } = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState,
        ledger,
        maxDepth: 5,
        newId: counterIds("z"),
      })
    )
    const zones = Object.values(grown.geometry.zones)
    for (let a = 0; a < zones.length; a++) {
      for (let b = a + 1; b < zones.length; b++) {
        expect(rectsOverlap(rectOfZone(zones[a]!), rectOfZone(zones[b]!))).toBe(
          false
        )
      }
    }
    // Spacing stays at its base for the whole carve (no feedback inflation).
    expect(
      pageSpacing(grown.geometry, "default", grown.generation.connections)
    ).toBe(pageSpacing(instanceState.geometry, "default", {}))
    // Every generated connection joins two adjacency-legal templates.
    for (const [connId, conn] of Object.entries(grown.geometry.connections)) {
      if (grown.generation.connections[connId] === undefined) continue
      const from = grown.geometry.zones[conn.fromZoneId]!
      const to = grown.geometry.zones[conn.toZoneId]!
      const fromT = set.templates[from.templateKey!]
      const toT = set.templates[to.templateKey!]
      if (fromT && toT) expect(pairLegal(fromT, toT)).toBe(true)
    }
  })

  it("is a deterministic function of the seed (identical ids and geometry)", () => {
    const a = seeded("same-seed")
    const b = seeded("same-seed")
    const grownA = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState: a.instanceState,
        ledger: a.ledger,
        maxDepth: 5,
        newId: counterIds("z"),
      })
    )
    const grownB = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState: b.instanceState,
        ledger: b.ledger,
        maxDepth: 5,
        newId: counterIds("z"),
      })
    )
    expect(grownA).toStrictEqual(grownB)
  })

  it("a different seed grows a different map", () => {
    const a = seeded("seed-a")
    const b = seeded("seed-b")
    const grownA = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState: a.instanceState,
        ledger: a.ledger,
        maxDepth: 5,
        newId: counterIds("z"),
      })
    )
    const grownB = unwrapPregen(
      pregenerateExpedition({
        set,
        instanceState: b.instanceState,
        ledger: b.ledger,
        maxDepth: 5,
        newId: counterIds("z"),
      })
    )
    // The carved geometry differs (positions/templates), not just the ids.
    const shape = (s: MapInstanceState) =>
      Object.values(s.geometry.zones)
        .map((z) => `${z.templateKey}@${z.position.x},${z.position.y}`)
        .sort()
        .join("|")
    expect(shape(grownA.instanceState)).not.toBe(shape(grownB.instanceState))
  })
})
