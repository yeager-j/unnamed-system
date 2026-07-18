import { describe, expect, it } from "vitest"

import {
  DEFAULT_PAGE_ID,
  mapGeometrySchema,
  type MapGeometry,
} from "./geometry.schema"
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
        {
          id,
          name,
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: DEFAULT_PAGE_ID,
        },
      ])
    ),
  })
}

function addZone(
  geometry: MapGeometry,
  id: string,
  position: Point,
  pageId: string = DEFAULT_PAGE_ID
): MapGeometry {
  return reduceMapGeometry(geometry, { kind: "addZone", id, position, pageId })
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
      pageId: DEFAULT_PAGE_ID,
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
      pageId: DEFAULT_PAGE_ID,
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
        pageId: DEFAULT_PAGE_ID,
      })
    ).toBe(geometry)
  })

  it("produces geometry that still parses", () => {
    const geometry = reduceMapGeometry(withZones(["a", "A"]), {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "b",
      position: { x: 5, y: 5 },
      pageId: DEFAULT_PAGE_ID,
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
      zones: {
        a: {
          id: "a",
          name: "A",
          position: { x: 0, y: 0 },
          pageId: DEFAULT_PAGE_ID,
        },
      },
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
          pageId: DEFAULT_PAGE_ID,
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

/** Two pages ("default" + p2), zones a/b on default and c on p2, with an
 *  intra-page connection ab and a cross-page connection bc. */
function twoPageGeometry(): MapGeometry {
  const paged = reduceMapGeometry(withZones(["a", "A"], ["b", "B"]), {
    kind: "addPage",
    id: "p2",
    name: "Undercroft",
  })
  const withC = reduceMapGeometry(paged, {
    kind: "addZone",
    id: "c",
    position: { x: 0, y: 0 },
    pageId: "p2",
  })
  return addConnection(addConnection(withC, "ab", "a", "b"), "bc", "b", "c")
}

describe("addPage", () => {
  it("mints a page under the supplied id with the trimmed name", () => {
    const next = reduceMapGeometry(makeGeometry(), {
      kind: "addPage",
      id: "p2",
      name: "  Undercroft  ",
    })
    expect(next.pages["p2"]).toEqual({ id: "p2", name: "Undercroft" })
  })

  it("derives the lowest free 'Page N' when the name is absent or blank", () => {
    const base = makeGeometry() // holds "Page 1" (the default page)
    const second = reduceMapGeometry(base, { kind: "addPage", id: "p2" })
    expect(second.pages["p2"]?.name).toBe("Page 2")

    const blank = reduceMapGeometry(second, {
      kind: "addPage",
      id: "p3",
      name: "   ",
    })
    expect(blank.pages["p3"]?.name).toBe("Page 3")
  })

  it("no-ops an existing id (same ref)", () => {
    const geometry = makeGeometry()
    expect(
      reduceMapGeometry(geometry, { kind: "addPage", id: DEFAULT_PAGE_ID })
    ).toBe(geometry)
  })
})

describe("renamePage", () => {
  it("trims and sets the name", () => {
    const next = reduceMapGeometry(makeGeometry(), {
      kind: "renamePage",
      pageId: DEFAULT_PAGE_ID,
      name: "  Ground Floor  ",
    })
    expect(next.pages[DEFAULT_PAGE_ID]?.name).toBe("Ground Floor")
  })

  it("no-ops an empty name and an unknown id (same ref)", () => {
    const geometry = makeGeometry()
    expect(
      reduceMapGeometry(geometry, {
        kind: "renamePage",
        pageId: DEFAULT_PAGE_ID,
        name: "   ",
      })
    ).toBe(geometry)
    expect(
      reduceMapGeometry(geometry, {
        kind: "renamePage",
        pageId: "ghost",
        name: "X",
      })
    ).toBe(geometry)
  })
})

describe("deletePage", () => {
  it("cascades the page's zones and every connection touching them, severing cross-page links", () => {
    const next = reduceMapGeometry(twoPageGeometry(), {
      kind: "deletePage",
      pageId: DEFAULT_PAGE_ID,
    })
    expect(Object.keys(next.pages)).toEqual(["p2"])
    expect(Object.keys(next.zones)).toEqual(["c"])
    expect(next.connections).toEqual({})
  })

  it("keeps the surviving page's intra-page geometry intact", () => {
    const next = reduceMapGeometry(twoPageGeometry(), {
      kind: "deletePage",
      pageId: "p2",
    })
    expect(Object.keys(next.zones).sort()).toEqual(["a", "b"])
    expect(Object.keys(next.connections)).toEqual(["ab"])
  })

  it("no-ops the last remaining page (same ref)", () => {
    const geometry = withZones(["a", "A"])
    expect(
      reduceMapGeometry(geometry, {
        kind: "deletePage",
        pageId: DEFAULT_PAGE_ID,
      })
    ).toBe(geometry)
  })

  it("no-ops an unknown id (same ref)", () => {
    const geometry = twoPageGeometry()
    expect(
      reduceMapGeometry(geometry, { kind: "deletePage", pageId: "ghost" })
    ).toBe(geometry)
  })
})

describe("duplicatePage", () => {
  it("deep-copies the page's zones and intra-page connections under the supplied id maps", () => {
    const base = twoPageGeometry()
    const next = reduceMapGeometry(base, {
      kind: "duplicatePage",
      sourcePageId: DEFAULT_PAGE_ID,
      newPageId: "p3",
      zoneIdMap: { a: "a2", b: "b2" },
      connectionIdMap: { ab: "ab2" },
    })
    expect(next.pages["p3"]).toEqual({ id: "p3", name: "Page 1 copy" })
    expect(next.zones["a2"]).toMatchObject({
      id: "a2",
      name: "A",
      pageId: "p3",
      position: base.zones["a"]!.position,
    })
    expect(next.connections["ab2"]).toMatchObject({
      id: "ab2",
      fromZoneId: "a2",
      toZoneId: "b2",
    })
    expect(base.zones["a"]).toEqual(next.zones["a"])
  })

  it("does not copy cross-page connections even when mapped", () => {
    const next = reduceMapGeometry(twoPageGeometry(), {
      kind: "duplicatePage",
      sourcePageId: DEFAULT_PAGE_ID,
      newPageId: "p3",
      zoneIdMap: { a: "a2", b: "b2" },
      connectionIdMap: { ab: "ab2", bc: "bc2" },
    })
    expect(next.connections).not.toHaveProperty("bc2")
  })

  it("skips a stale zone map entry and its dependent connections", () => {
    const next = reduceMapGeometry(twoPageGeometry(), {
      kind: "duplicatePage",
      sourcePageId: DEFAULT_PAGE_ID,
      newPageId: "p3",
      zoneIdMap: { a: "a2", ghost: "g2" },
      connectionIdMap: { ab: "ab2" },
    })
    expect(next.zones).toHaveProperty("a2")
    expect(next.zones).not.toHaveProperty("g2")
    // b was never mapped, so ab can't remap both endpoints — not copied.
    expect(next.connections).not.toHaveProperty("ab2")
  })

  it("no-ops an unknown source page and a taken new id (same ref)", () => {
    const geometry = twoPageGeometry()
    expect(
      reduceMapGeometry(geometry, {
        kind: "duplicatePage",
        sourcePageId: "ghost",
        newPageId: "p3",
        zoneIdMap: {},
        connectionIdMap: {},
      })
    ).toBe(geometry)
    expect(
      reduceMapGeometry(geometry, {
        kind: "duplicatePage",
        sourcePageId: DEFAULT_PAGE_ID,
        newPageId: "p2",
        zoneIdMap: {},
        connectionIdMap: {},
      })
    ).toBe(geometry)
  })

  it("produces geometry that still parses", () => {
    const next = reduceMapGeometry(twoPageGeometry(), {
      kind: "duplicatePage",
      sourcePageId: DEFAULT_PAGE_ID,
      newPageId: "p3",
      zoneIdMap: { a: "a2", b: "b2" },
      connectionIdMap: { ab: "ab2" },
    })
    expect(() => mapGeometrySchema.parse(next)).not.toThrow()
  })
})

describe("moveZoneToPage", () => {
  it("re-homes the zone, leaving position and connections untouched", () => {
    const base = twoPageGeometry()
    const next = reduceMapGeometry(base, {
      kind: "moveZoneToPage",
      zoneId: "a",
      pageId: "p2",
    })
    expect(next.zones["a"]?.pageId).toBe("p2")
    expect(next.zones["a"]?.position).toEqual(base.zones["a"]!.position)
    expect(next.connections).toEqual(base.connections)
  })

  it("no-ops an unknown zone, an unknown page, and a same-page move (same ref)", () => {
    const geometry = twoPageGeometry()
    expect(
      reduceMapGeometry(geometry, {
        kind: "moveZoneToPage",
        zoneId: "ghost",
        pageId: "p2",
      })
    ).toBe(geometry)
    expect(
      reduceMapGeometry(geometry, {
        kind: "moveZoneToPage",
        zoneId: "a",
        pageId: "ghost",
      })
    ).toBe(geometry)
    expect(
      reduceMapGeometry(geometry, {
        kind: "moveZoneToPage",
        zoneId: "a",
        pageId: DEFAULT_PAGE_ID,
      })
    ).toBe(geometry)
  })
})

describe("page stamping on zone mints", () => {
  it("addZone stamps the event's page and no-ops an unknown page", () => {
    const geometry = twoPageGeometry()
    const next = addZone(geometry, "d", { x: 9, y: 9 }, "p2")
    expect(next.zones["d"]?.pageId).toBe("p2")

    expect(addZone(geometry, "e", { x: 0, y: 0 }, "ghost")).toBe(geometry)
  })

  it("duplicateZone stamps the event's page and no-ops an unknown page", () => {
    const geometry = twoPageGeometry()
    const next = reduceMapGeometry(geometry, {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "a2",
      position: { x: 1, y: 1 },
      pageId: "p2",
    })
    expect(next.zones["a2"]?.pageId).toBe("p2")

    expect(
      reduceMapGeometry(geometry, {
        kind: "duplicateZone",
        sourceId: "a",
        newId: "a3",
        position: { x: 1, y: 1 },
        pageId: "ghost",
      })
    ).toBe(geometry)
  })
})

describe("setZoneBinding (UNN-590)", () => {
  const bind = (
    geometry: MapGeometry,
    zoneId: string,
    binding: {
      templateKey?: string | null
      portalMapId?: string | null
      rollContentsAtStart?: boolean | null
    }
  ) => reduceMapGeometry(geometry, { kind: "setZoneBinding", zoneId, binding })

  it("sets each binding field independently", () => {
    const base = withZones(["a", "A"])
    const bound = bind(base, "a", {
      templateKey: "hall",
      rollContentsAtStart: true,
    })
    expect(bound.zones["a"]).toMatchObject({
      templateKey: "hall",
      rollContentsAtStart: true,
    })
    expect(bound.zones["a"]?.portalMapId).toBeUndefined()
  })

  it("absent fields leave current values untouched", () => {
    const base = bind(withZones(["a", "A"]), "a", { templateKey: "hall" })
    const next = bind(base, "a", { portalMapId: "map-x" })
    expect(next.zones["a"]).toMatchObject({
      templateKey: "hall",
      portalMapId: "map-x",
    })
  })

  it("null clears: a cleared zone deep-equals a never-bound one", () => {
    const base = withZones(["a", "A"])
    const bound = bind(base, "a", {
      templateKey: "hall",
      portalMapId: "map-x",
      rollContentsAtStart: true,
    })
    const cleared = bind(bound, "a", {
      templateKey: null,
      portalMapId: null,
      rollContentsAtStart: null,
    })
    expect(cleared).toStrictEqual(base)
  })

  it("no-ops (same ref) on an unknown zone", () => {
    const base = withZones(["a", "A"])
    expect(bind(base, "ghost", { templateKey: "hall" })).toBe(base)
  })

  it("stays a load-schema fixed point after set and clear", () => {
    const bound = bind(withZones(["a", "A"]), "a", { templateKey: "hall" })
    expect(mapGeometrySchema.parse(bound)).toStrictEqual(bound)
    const cleared = bind(bound, "a", { templateKey: null })
    expect(mapGeometrySchema.parse(cleared)).toStrictEqual(cleared)
  })
})

describe("duplicateZone copies binding fields", () => {
  it("a duplicated bound zone keeps its templateKey/portalMapId/rollContentsAtStart", () => {
    const base = reduceMapGeometry(withZones(["a", "A"]), {
      kind: "setZoneBinding",
      zoneId: "a",
      binding: { templateKey: "hall", rollContentsAtStart: true },
    })
    const next = reduceMapGeometry(base, {
      kind: "duplicateZone",
      sourceId: "a",
      newId: "b",
      position: { x: 50, y: 50 },
      pageId: DEFAULT_PAGE_ID,
    })
    expect(next.zones["b"]).toMatchObject({
      templateKey: "hall",
      rollContentsAtStart: true,
    })
  })
})

describe("setEntryZone (UNN-590)", () => {
  it("sets, replaces (single-select), and clears the entry designation", () => {
    const base = withZones(["a", "A"], ["b", "B"])
    const withEntry = reduceMapGeometry(base, {
      kind: "setEntryZone",
      zoneId: "a",
    })
    expect(withEntry.entryZoneId).toBe("a")

    const replaced = reduceMapGeometry(withEntry, {
      kind: "setEntryZone",
      zoneId: "b",
    })
    expect(replaced.entryZoneId).toBe("b")

    const cleared = reduceMapGeometry(replaced, {
      kind: "setEntryZone",
      zoneId: null,
    })
    expect(cleared).toStrictEqual(base)
  })

  it("no-ops (same ref) on an unknown zone and on clearing an unset entry", () => {
    const base = withZones(["a", "A"])
    expect(
      reduceMapGeometry(base, { kind: "setEntryZone", zoneId: "ghost" })
    ).toBe(base)
    expect(
      reduceMapGeometry(base, { kind: "setEntryZone", zoneId: null })
    ).toBe(base)
  })

  it("deleteZone clears a dangling entry designation", () => {
    const base = reduceMapGeometry(withZones(["a", "A"], ["b", "B"]), {
      kind: "setEntryZone",
      zoneId: "a",
    })
    const next = reduceMapGeometry(base, { kind: "deleteZone", zoneId: "a" })
    expect(next.entryZoneId).toBeUndefined()
    const untouched = reduceMapGeometry(base, {
      kind: "deleteZone",
      zoneId: "b",
    })
    expect(untouched.entryZoneId).toBe("a")
  })

  it("deletePage clears the entry designation when its zone was on the page", () => {
    let geometry = reduceMapGeometry(withZones(["a", "A"]), {
      kind: "addPage",
      id: "p2",
    })
    geometry = addZone(geometry, "b", { x: 0, y: 0 }, "p2")
    geometry = reduceMapGeometry(geometry, {
      kind: "setEntryZone",
      zoneId: "b",
    })
    const next = reduceMapGeometry(geometry, {
      kind: "deletePage",
      pageId: "p2",
    })
    expect(next.entryZoneId).toBeUndefined()
  })
})

describe("setPageGrowth (UNN-590)", () => {
  it("sets and clears the page growth mode", () => {
    const base = makeGeometry()
    const open = reduceMapGeometry(base, {
      kind: "setPageGrowth",
      pageId: DEFAULT_PAGE_ID,
      growth: "open",
    })
    expect(open.pages[DEFAULT_PAGE_ID]?.growth).toBe("open")

    const cleared = reduceMapGeometry(open, {
      kind: "setPageGrowth",
      pageId: DEFAULT_PAGE_ID,
      growth: null,
    })
    expect(cleared).toStrictEqual(base)
  })

  it("no-ops (same ref) on an unknown page", () => {
    const base = makeGeometry()
    expect(
      reduceMapGeometry(base, {
        kind: "setPageGrowth",
        pageId: "ghost",
        growth: "edge",
      })
    ).toBe(base)
  })
})
