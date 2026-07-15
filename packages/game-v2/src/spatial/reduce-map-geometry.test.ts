import { describe, expect, it } from "vitest"

import { mapGeometrySchema, type MapGeometry } from "./geometry.schema"
import { reduceMapGeometry } from "./reduce-map-geometry"

type Point = { x: number; y: number }

function makeGeometry(partial?: Partial<MapGeometry>): MapGeometry {
  return mapGeometrySchema.parse(partial ?? {})
}

function withZones(...names: [id: string, name: string][]): MapGeometry {
  return makeGeometry({
    zones: Object.fromEntries(
      names.map(([id, name]) => [
        id,
        { id, name, description: "", dmNotes: "", position: { x: 0, y: 0 } },
      ])
    ),
  })
}

function addZone(
  geometry: MapGeometry,
  id: string,
  position: Point
): MapGeometry {
  return reduceMapGeometry(geometry, { kind: "addZone", id, position })
}

function addConnection(
  geometry: MapGeometry,
  id: string,
  fromZoneId: string,
  toZoneId: string
): MapGeometry {
  return reduceMapGeometry(geometry, {
    kind: "addConnection",
    id,
    fromZoneId,
    toZoneId,
  })
}

function setZoneText(
  geometry: MapGeometry,
  zoneId: string,
  patch: { description?: string; dmNotes?: string }
): MapGeometry {
  return reduceMapGeometry(geometry, { kind: "setZoneText", zoneId, patch })
}

describe("addZone", () => {
  it("adds a zone with a unique numbered default name", () => {
    const one = addZone(makeGeometry(), "a", { x: 10, y: 20 })
    expect(one.zones["a"]).toMatchObject({
      id: "a",
      name: "Zone 1",
      description: "",
      dmNotes: "",
      position: { x: 10, y: 20 },
    })

    const two = addZone(one, "b", { x: 0, y: 0 })
    expect(two.zones["b"]?.name).toBe("Zone 2")
  })

  it("fills the lowest free slot rather than always counting up", () => {
    const geometry = withZones(["a", "Zone 1"], ["b", "Zone 3"])
    expect(addZone(geometry, "c", { x: 0, y: 0 }).zones["c"]?.name).toBe(
      "Zone 2"
    )
  })

  it("does not mutate the input", () => {
    const geometry = makeGeometry()
    addZone(geometry, "a", { x: 1, y: 1 })
    expect(geometry.zones).toEqual({})
  })

  it("produces geometry that still parses", () => {
    const geometry = addZone(makeGeometry(), "a", { x: 1, y: 1 })
    expect(() => mapGeometrySchema.parse(geometry)).not.toThrow()
  })
})

describe("duplicateZone", () => {
  it("copies the source's text to a new id and position, suffixing the name", () => {
    const base = setZoneText(withZones(["a", "Vault"]), "a", {
      description: "gilded",
      dmNotes: "trapped",
    })
    const next = reduceMapGeometry(base, {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "b",
      position: { x: 40, y: 40 },
    })
    expect(next.zones["b"]).toMatchObject({
      id: "b",
      name: "Vault copy",
      description: "gilded",
      dmNotes: "trapped",
      position: { x: 40, y: 40 },
    })
    expect(next.zones["a"]).toEqual(base.zones["a"])
  })

  it("carries over no connections", () => {
    const connected = addConnection(
      withZones(["a", "A"], ["b", "B"]),
      "ab",
      "a",
      "b"
    )
    const next = reduceMapGeometry(connected, {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "c",
      position: { x: 1, y: 1 },
    })
    expect(Object.keys(next.connections)).toEqual(["ab"])
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "duplicateZone",
        sourceId: "ghost",
        newId: "b",
        position: { x: 0, y: 0 },
      })
    ).toBe(geometry)
  })

  it("produces geometry that still parses", () => {
    const geometry = reduceMapGeometry(withZones(["a", "A"]), {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "b",
      position: { x: 5, y: 5 },
    })
    expect(() => mapGeometrySchema.parse(geometry)).not.toThrow()
  })
})

describe("renameZone", () => {
  it("trims and sets the name", () => {
    const geometry = withZones(["a", "Old"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "renameZone",
        zoneId: "a",
        name: "  New  ",
      }).zones["a"]?.name
    ).toBe("New")
  })

  it("no-ops an empty/whitespace name (schema requires ≥1 char)", () => {
    const geometry = withZones(["a", "Keep"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "renameZone",
        zoneId: "a",
        name: "   ",
      }).zones["a"]?.name
    ).toBe("Keep")
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "renameZone",
        zoneId: "ghost",
        name: "X",
      })
    ).toBe(geometry)
  })
})

describe("setZoneText", () => {
  it("patches description and dmNotes independently", () => {
    const geometry = withZones(["a", "A"])
    const next = setZoneText(geometry, "a", { description: "players see this" })
    expect(next.zones["a"]?.description).toBe("players see this")
    expect(next.zones["a"]?.dmNotes).toBe("")

    const notes = setZoneText(next, "a", { dmNotes: "secret" })
    expect(notes.zones["a"]?.description).toBe("players see this")
    expect(notes.zones["a"]?.dmNotes).toBe("secret")
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(setZoneText(geometry, "ghost", { dmNotes: "x" })).toBe(geometry)
  })
})

describe("setZoneIdentity", () => {
  it("patches size and mood independently, leaving absent fields untouched", () => {
    const base = withZones(["a", "A"])
    const sized = reduceMapGeometry(base, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { size: "L" },
    })
    expect(sized.zones["a"]?.size).toBe("L")
    expect(sized.zones["a"]).not.toHaveProperty("mood")

    const mooded = reduceMapGeometry(sized, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { mood: "warm" },
    })
    expect(mooded.zones["a"]?.size).toBe("L")
    expect(mooded.zones["a"]?.mood).toBe("warm")
  })

  it("sets and updates a motif", () => {
    const base = withZones(["a", "A"])
    const set = reduceMapGeometry(base, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { motif: "altar" },
    })
    expect(set.zones["a"]?.motif).toBe("altar")

    const updated = reduceMapGeometry(set, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { motif: "tomb" },
    })
    expect(updated.zones["a"]?.motif).toBe("tomb")
  })

  it("clears a motif by deleting the key: set → clear deep-equals never-set", () => {
    const neverSet = withZones(["a", "A"])
    const set = reduceMapGeometry(neverSet, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { motif: "bones" },
    })
    const cleared = reduceMapGeometry(set, {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { motif: null },
    })
    expect(cleared.zones["a"]).not.toHaveProperty("motif")
    expect(cleared.zones["a"]).toStrictEqual(neverSet.zones["a"])
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "setZoneIdentity",
        zoneId: "ghost",
        identity: { size: "S" },
      })
    ).toBe(geometry)
  })

  it("produces geometry that still parses", () => {
    const geometry = reduceMapGeometry(withZones(["a", "A"]), {
      kind: "setZoneIdentity",
      zoneId: "a",
      identity: { size: "XL", motif: "water", mood: "cool" },
    })
    expect(() => mapGeometrySchema.parse(geometry)).not.toThrow()
  })
})

describe("mapZoneSchema identity fields", () => {
  it("leaves absent identity fields absent (load-schema fixed point)", () => {
    const parsed = mapGeometrySchema.parse({
      zones: { a: { id: "a", name: "A", position: { x: 0, y: 0 } } },
    })
    const zone = parsed.zones["a"]!
    expect(zone).not.toHaveProperty("size")
    expect(zone).not.toHaveProperty("motif")
    expect(zone).not.toHaveProperty("mood")
  })

  it("preserves present identity fields through a parse round trip", () => {
    const parsed = mapGeometrySchema.parse({
      zones: {
        a: {
          id: "a",
          name: "A",
          position: { x: 0, y: 0 },
          size: "L",
          motif: "altar",
          mood: "warm",
        },
      },
    })
    expect(parsed.zones["a"]).toMatchObject({
      size: "L",
      motif: "altar",
      mood: "warm",
    })
  })
})

describe("moveZone", () => {
  it("updates the node position", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "moveZone",
        zoneId: "a",
        position: { x: 99, y: -5 },
      }).zones["a"]?.position
    ).toEqual({ x: 99, y: -5 })
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "moveZone",
        zoneId: "ghost",
        position: { x: 1, y: 1 },
      })
    ).toBe(geometry)
  })
})

describe("deleteZone", () => {
  it("removes the zone and cascades connections referencing it (either endpoint)", () => {
    const base = withZones(["a", "A"], ["b", "B"], ["c", "C"])
    const connected = addConnection(
      addConnection(base, "ab", "a", "b"),
      "bc",
      "b",
      "c"
    )

    const next = reduceMapGeometry(connected, {
      kind: "deleteZone",
      zoneId: "b",
    })
    expect(next.zones).not.toHaveProperty("b")
    expect(next.zones).toHaveProperty("a")
    expect(next.zones).toHaveProperty("c")
    expect(next.connections).toEqual({})
  })

  it("keeps connections that don't touch the deleted zone", () => {
    const base = withZones(["a", "A"], ["b", "B"], ["c", "C"])
    const connected = addConnection(base, "ac", "a", "c")
    const next = reduceMapGeometry(connected, {
      kind: "deleteZone",
      zoneId: "b",
    })
    expect(next.connections).toHaveProperty("ac")
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, { kind: "deleteZone", zoneId: "ghost" })
    ).toBe(geometry)
  })
})

describe("addConnection", () => {
  it("joins two zones", () => {
    const geometry = withZones(["a", "A"], ["b", "B"])
    const next = addConnection(geometry, "ab", "a", "b")
    expect(next.connections["ab"]).toMatchObject({
      id: "ab",
      fromZoneId: "a",
      toZoneId: "b",
      hidden: false,
      locked: false,
    })
  })

  it("no-ops a self-loop", () => {
    const geometry = withZones(["a", "A"])
    expect(addConnection(geometry, "aa", "a", "a")).toBe(geometry)
  })

  it("no-ops an unknown endpoint", () => {
    const geometry = withZones(["a", "A"])
    expect(addConnection(geometry, "ax", "a", "ghost")).toBe(geometry)
  })

  it("no-ops a duplicate in either direction", () => {
    const geometry = addConnection(
      withZones(["a", "A"], ["b", "B"]),
      "ab",
      "a",
      "b"
    )
    expect(addConnection(geometry, "ab2", "a", "b")).toBe(geometry)
    expect(addConnection(geometry, "ba", "b", "a")).toBe(geometry)
  })
})

describe("setConnectionFlag", () => {
  it("sets hidden and locked independently", () => {
    const geometry = addConnection(
      withZones(["a", "A"], ["b", "B"]),
      "ab",
      "a",
      "b"
    )
    const hidden = reduceMapGeometry(geometry, {
      kind: "setConnectionFlag",
      connectionId: "ab",
      flag: "hidden",
      value: true,
    })
    expect(hidden.connections["ab"]).toMatchObject({
      hidden: true,
      locked: false,
    })

    const locked = reduceMapGeometry(hidden, {
      kind: "setConnectionFlag",
      connectionId: "ab",
      flag: "locked",
      value: true,
    })
    expect(locked.connections["ab"]).toMatchObject({
      hidden: true,
      locked: true,
    })
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "setConnectionFlag",
        connectionId: "ghost",
        flag: "hidden",
        value: true,
      })
    ).toBe(geometry)
  })
})

describe("deleteConnection", () => {
  it("removes the connection", () => {
    const geometry = addConnection(
      withZones(["a", "A"], ["b", "B"]),
      "ab",
      "a",
      "b"
    )
    expect(
      reduceMapGeometry(geometry, {
        kind: "deleteConnection",
        connectionId: "ab",
      }).connections
    ).toEqual({})
  })

  it("no-ops an unknown id", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "deleteConnection",
        connectionId: "ghost",
      })
    ).toBe(geometry)
  })
})
