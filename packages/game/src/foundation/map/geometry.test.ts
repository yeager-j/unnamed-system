import { describe, expect, it } from "vitest"

import { mapGeometrySchema } from "@workspace/game/foundation/map/geometry"

describe("mapGeometrySchema", () => {
  it("defaults an empty geometry so a freshly-created Map parses", () => {
    const parsed = mapGeometrySchema.parse({})

    expect(parsed).toEqual({ zones: {}, connections: {} })
  })

  it("round-trips an authored zone with its node position, description, and DM notes", () => {
    const geometry = {
      zones: {
        "zone-a": {
          id: "zone-a",
          name: "Crypt",
          description: "A cold stone chamber.",
          dmNotes: "Trapped sarcophagus.",
          position: { x: 120, y: -40 },
        },
      },
      connections: {},
    }

    expect(mapGeometrySchema.parse(geometry)).toEqual(geometry)
  })

  it("defaults per-zone text and per-connection flags", () => {
    const parsed = mapGeometrySchema.parse({
      zones: {
        "zone-a": { id: "zone-a", name: "Hall", position: { x: 0, y: 0 } },
      },
      connections: {
        "conn-1": { id: "conn-1", fromZoneId: "zone-a", toZoneId: "zone-b" },
      },
    })

    expect(parsed.zones["zone-a"]).toMatchObject({
      description: "",
      dmNotes: "",
    })
    expect(parsed.connections["conn-1"]).toMatchObject({
      hidden: false,
      locked: false,
    })
  })

  it("rejects a zone with an empty name", () => {
    const result = mapGeometrySchema.safeParse({
      zones: {
        "zone-a": { id: "zone-a", name: "", position: { x: 0, y: 0 } },
      },
    })

    expect(result.success).toBe(false)
  })
})
