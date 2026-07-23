import { describe, expect, it } from "vitest"

import { makeMapInstanceState } from "../spatial/__fixtures__/spatial"
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
    generation: {
      zones: { entry: { source: "authored", depth: 0 } },
      stubs: {},
      connections: {},
      grafts: {},
      startingZoneIds: ["entry"],
    },
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

describe("pregenerateExpedition", () => {
  it("carves the whole map to the target, then seals the frontier", () => {
    const { instanceState, ledger } = seeded("pregen-seed")
    const result = pregenerateExpedition({
      set,
      instanceState,
      ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })

    const zoneCount = Object.keys(result.instanceState.geometry.zones).length
    expect(zoneCount).toBeGreaterThanOrEqual(20)
    expect(zoneCount).toBeLessThanOrEqual(30)
    // Frontier sealed — no open stubs, so no phantom exits in the snapshot.
    expect(result.instanceState.generation.stubs).toEqual({})
    // Every carved zone recorded a mint (retract still works at prep).
    const generated = Object.entries(
      result.instanceState.generation.zones
    ).filter(([, provenance]) => provenance.source === "generated")
    expect(generated.length).toBe(zoneCount - 1) // all but the authored Entry
    for (const [zoneId] of generated) {
      expect(result.ledger.mints[zoneId]).toBeDefined()
    }
  })

  it("never overlaps footprints and keeps every mint adjacency-legal", () => {
    const { instanceState, ledger } = seeded("pregen-seed")
    const { instanceState: grown } = pregenerateExpedition({
      set,
      instanceState,
      ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })
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
    const grownA = pregenerateExpedition({
      set,
      instanceState: a.instanceState,
      ledger: a.ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })
    const grownB = pregenerateExpedition({
      set,
      instanceState: b.instanceState,
      ledger: b.ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })
    expect(grownA).toStrictEqual(grownB)
  })

  it("a different seed grows a different map", () => {
    const a = seeded("seed-a")
    const b = seeded("seed-b")
    const grownA = pregenerateExpedition({
      set,
      instanceState: a.instanceState,
      ledger: a.ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })
    const grownB = pregenerateExpedition({
      set,
      instanceState: b.instanceState,
      ledger: b.ledger,
      zoneTarget: 30,
      newId: counterIds("z"),
    })
    // The carved geometry differs (positions/templates), not just the ids.
    const shape = (s: MapInstanceState) =>
      Object.values(s.geometry.zones)
        .map((z) => `${z.templateKey}@${z.position.x},${z.position.y}`)
        .sort()
        .join("|")
    expect(shape(grownA.instanceState)).not.toBe(shape(grownB.instanceState))
  })
})
