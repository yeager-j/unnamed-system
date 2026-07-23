import { describe, expect, it } from "vitest"

import {
  mapGeometrySchema,
  reduceMapGeometry,
} from "@workspace/game-v2/spatial"

import {
  mapGeometryEvents,
  mapRename,
  reduceMapGeometryEvents,
} from "./protocol"

const baseGeometry = () =>
  reduceMapGeometry(
    reduceMapGeometry(mapGeometrySchema.parse({}), {
      kind: "addZone",
      id: "a",
      pageId: "default",
      position: { x: 0, y: 0 },
    }),
    {
      kind: "addZone",
      id: "b",
      pageId: "default",
      position: { x: 10, y: 10 },
    }
  )

describe("map protocol", () => {
  it("predicts names and geometry event batches without client versions", () => {
    const renamed = mapRename.predict(
      { name: "Atlas", geometry: baseGeometry() },
      { mapId: "map-1", name: "Meridian" },
      { mutationId: "rename-1" }
    )
    expect(renamed).toMatchObject({ ok: true, value: { name: "Meridian" } })

    const moved = mapGeometryEvents.predict(
      { name: "Atlas", geometry: baseGeometry() },
      {
        mapId: "map-1",
        events: [{ kind: "moveZone", zoneId: "a", position: { x: 4, y: 5 } }],
      },
      { mutationId: "geometry-1" }
    )
    expect(moved.ok && moved.value.geometry.zones.a?.position).toEqual({
      x: 4,
      y: 5,
    })
  })

  it("composes disjoint edits against current state in either arrival order", () => {
    const first = { kind: "renameZone", zoneId: "a", name: "Atrium" } as const
    const second = { kind: "renameZone", zoneId: "b", name: "Bridge" } as const

    expect(reduceMapGeometryEvents(baseGeometry(), [first, second])).toEqual(
      reduceMapGeometryEvents(baseGeometry(), [second, first])
    )
  })

  it("defines same-target edits as authority-order last intent wins", () => {
    const first = { kind: "renameZone", zoneId: "a", name: "Atrium" } as const
    const second = { kind: "renameZone", zoneId: "a", name: "Archive" } as const

    expect(
      reduceMapGeometryEvents(baseGeometry(), [first, second]).zones.a?.name
    ).toBe("Archive")
    expect(
      reduceMapGeometryEvents(baseGeometry(), [second, first]).zones.a?.name
    ).toBe("Atrium")
  })

  it("refuses a batch that cannot replay over current geometry", () => {
    const result = mapGeometryEvents.predict(
      { name: "Atlas", geometry: baseGeometry() },
      {
        mapId: "map-1",
        events: [{ kind: "renameZone", zoneId: "missing", name: "Gone" }],
      },
      { mutationId: "geometry-2" }
    )

    expect(result).toEqual({ ok: false, error: "map-event-refused" })
  })

  it("refuses a caller-minted id that current geometry already owns", () => {
    const result = mapGeometryEvents.predict(
      { name: "Atlas", geometry: baseGeometry() },
      {
        mapId: "map-1",
        events: [
          {
            kind: "addZone",
            id: "a",
            pageId: "default",
            position: { x: 20, y: 20 },
          },
        ],
      },
      { mutationId: "geometry-3" }
    )

    expect(result).toEqual({ ok: false, error: "map-event-refused" })
  })
})
