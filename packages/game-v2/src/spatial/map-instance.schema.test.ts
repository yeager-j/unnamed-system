import { describe, expect, it } from "vitest"

import {
  generationStateSchema,
  mapInstanceStateSchema,
} from "./map-instance.schema"

describe("mapInstanceStateSchema — generation slice", () => {
  it("defaults an old blob with no generation key to the empty slice", () => {
    const parsed = mapInstanceStateSchema.parse({
      occupancy: {},
      reveal: {},
    })

    expect(parsed.generation).toStrictEqual({ zones: {}, grafts: {} })
  })

  it("is a fixed point (parse ∘ parse === parse)", () => {
    const once = mapInstanceStateSchema.parse({})
    expect(mapInstanceStateSchema.parse(once)).toStrictEqual(once)
  })

  it("preserves stored provenance and graft entries", () => {
    const parsed = mapInstanceStateSchema.parse({
      generation: {
        zones: {
          "zone-a": { source: "authored" },
          "zone-b": { source: "manual" },
        },
        grafts: { "map-x": { pageIds: ["p1", "p2"] } },
      },
    })

    expect(parsed.generation.zones["zone-a"]).toEqual({ source: "authored" })
    expect(parsed.generation.zones["zone-b"]).toEqual({ source: "manual" })
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
})
