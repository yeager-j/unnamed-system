import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { MapRow } from "@/lib/db/schema/map"

import { saveMapAction } from "./save-map"

// Stub the owner gate + the two writes so this is a pure unit test of the
// autosave orchestration — that the discriminated `patch` routes to the right
// field-scoped write, gated by `requireMapOwner`. `forbidden()` throws a
// sentinel so a refusal is assertable.
const requireMapOwner = vi.fn()
const renameMap = vi.fn()
const saveMapGeometry = vi.fn()

vi.mock("@/lib/auth/map-access", () => ({
  requireMapOwner: (id: string) => requireMapOwner(id),
}))
vi.mock("@/lib/db/writes/map", () => ({
  renameMap: (id: string, name: string) => renameMap(id, name),
  saveMapGeometry: (id: string, geometry: unknown) =>
    saveMapGeometry(id, geometry),
}))

const MAP_ID = "map-1"

beforeEach(() => {
  vi.clearAllMocks()
  requireMapOwner.mockResolvedValue({ id: MAP_ID } as MapRow)
  renameMap.mockResolvedValue(ok(undefined))
  saveMapGeometry.mockResolvedValue(ok(undefined))
})

describe("saveMapAction", () => {
  it("routes a name patch to renameMap (gated)", async () => {
    const result = await saveMapAction({
      mapId: MAP_ID,
      patch: { field: "name", name: "  Crypt  " },
    })

    expect(result).toEqual(ok(undefined))
    expect(requireMapOwner).toHaveBeenCalledWith(MAP_ID)
    expect(renameMap).toHaveBeenCalledWith(MAP_ID, "Crypt")
    expect(saveMapGeometry).not.toHaveBeenCalled()
  })

  it("routes a geometry patch to saveMapGeometry (gated)", async () => {
    const geometry = {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {
        "zone-a": {
          id: "zone-a",
          name: "Hall",
          description: "",
          dmNotes: "",
          position: { x: 10, y: 20 },
          pageId: "default",
        },
      },
      connections: {},
    }

    const result = await saveMapAction({
      mapId: MAP_ID,
      patch: { field: "geometry", geometry },
    })

    expect(result).toEqual(ok(undefined))
    expect(saveMapGeometry).toHaveBeenCalledWith(MAP_ID, geometry)
    expect(renameMap).not.toHaveBeenCalled()
  })

  it("rejects invalid input before touching the gate", async () => {
    const result = await saveMapAction({
      mapId: MAP_ID,
      patch: { field: "name", name: "" },
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireMapOwner).not.toHaveBeenCalled()
  })

  it("propagates a map-not-found write error to the caller", async () => {
    saveMapGeometry.mockResolvedValue(err("map-not-found"))

    const result = await saveMapAction({
      mapId: MAP_ID,
      patch: {
        field: "geometry",
        geometry: { zones: {}, connections: {} },
      },
    })

    expect(result).toEqual(err("map-not-found"))
  })
})
