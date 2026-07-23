import { describe, expect, it } from "vitest"

import {
  generationStateSchema,
  generationStubSchema,
  mapInstanceStateSchema,
} from "./map-instance.schema"

describe("mapInstanceStateSchema — generation slice", () => {
  it("defaults an old blob with no generation key to the empty slice", () => {
    const parsed = mapInstanceStateSchema.parse({
      occupancy: {},
      reveal: {},
    })

    expect(parsed.generation).toStrictEqual({
      zones: {},
      stubs: {},
      connections: {},
      grafts: {},
      startingZoneIds: [],
    })
  })

  it("heals a pre-P3 blob (zones/grafts only) with empty stubs and connections", () => {
    const parsed = mapInstanceStateSchema.parse({
      generation: {
        zones: { "zone-a": { source: "authored" } },
        grafts: {},
        startingZoneIds: [],
      },
    })

    expect(parsed.generation.stubs).toStrictEqual({})
    expect(parsed.generation.connections).toStrictEqual({})
  })

  it("is a fixed point (parse ∘ parse === parse)", () => {
    const once = mapInstanceStateSchema.parse({})
    expect(mapInstanceStateSchema.parse(once)).toStrictEqual(once)
  })

  it("preserves stored provenance, stub, and graft entries", () => {
    const stub = {
      id: "stub-1",
      zoneId: "zone-a",
      bearing: 1.25,
      anchor: { side: "e", offset: 0.4 },
    }
    const parsed = mapInstanceStateSchema.parse({
      generation: {
        zones: {
          "zone-a": { source: "authored", depth: 2, templateKey: "hall" },
          "zone-b": { source: "manual" },
        },
        stubs: { "stub-1": stub },
        connections: { "conn-1": { source: "generated" } },
        grafts: { "map-x": { pageIds: ["p1", "p2"] } },
      },
    })

    expect(parsed.generation.zones["zone-a"]).toEqual({
      source: "authored",
      depth: 2,
      templateKey: "hall",
    })
    expect(parsed.generation.stubs["stub-1"]).toEqual(stub)
    expect(parsed.generation.connections["conn-1"]).toEqual({
      source: "generated",
    })
    expect(parsed.generation.grafts["map-x"]).toEqual({ pageIds: ["p1", "p2"] })
  })
})

describe("generationStateSchema", () => {
  it("defaults a graft entry's pageIds to empty", () => {
    const parsed = generationStateSchema.parse({ grafts: { m: {} } })
    expect(parsed.grafts.m).toEqual({ pageIds: [] })
  })

  it("rejects an unknown provenance source", () => {
    expect(() =>
      generationStateSchema.parse({ zones: { z: { source: "conjured" } } })
    ).toThrow()
  })

  it("heals a pre-P3 provenance row with depth 0 (recomputed at start anyway)", () => {
    const parsed = generationStateSchema.parse({
      zones: { z: { source: "generated" } },
    })
    expect(parsed.zones.z).toEqual({ source: "generated", depth: 0 })
  })
})

describe("generationStubSchema", () => {
  it("rejects an out-of-range anchor offset and an unknown side", () => {
    const base = { id: "s", zoneId: "z", bearing: 0 }
    expect(() =>
      generationStubSchema.parse({
        ...base,
        anchor: { side: "n", offset: 1.5 },
      })
    ).toThrow()
    expect(() =>
      generationStubSchema.parse({
        ...base,
        anchor: { side: "up", offset: 0.5 },
      })
    ).toThrow()
  })
})
