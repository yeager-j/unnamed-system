import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import type { MapRow } from "@/lib/db/schema/map"

import { deleteMapAction } from "./delete-map"

// Stub the owner gate, the in-use check, the delete, and `revalidatePath` (imports
// `server-only` transitively) so this is a pure unit of the delete orchestration —
// including the UNN-589 refusal when a Region seeds from the map. `requireMapOwner`
// throws `forbidden()`; stub it to throw a sentinel.
const requireMapOwner = vi.fn()
const regionReferencesMap = vi.fn()
const deleteMap = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/auth/map-access", () => ({
  requireMapOwner: (id: string) => requireMapOwner(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  regionReferencesMap: (id: string) => regionReferencesMap(id),
}))
vi.mock("@/lib/db/writes/map", () => ({
  deleteMap: (id: string) => deleteMap(id),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))

const MAP_ID = "map-1"
const FORBIDDEN = new Error("forbidden")

beforeEach(() => {
  vi.clearAllMocks()
  requireMapOwner.mockResolvedValue({ id: MAP_ID } as MapRow)
  regionReferencesMap.mockResolvedValue(false)
})

describe("deleteMapAction", () => {
  it("lets a non-owner rejection from the gate propagate", async () => {
    requireMapOwner.mockRejectedValue(FORBIDDEN)

    await expect(deleteMapAction({ mapId: MAP_ID })).rejects.toBe(FORBIDDEN)
    expect(deleteMap).not.toHaveBeenCalled()
  })

  it("refuses when a Region seeds from the map", async () => {
    regionReferencesMap.mockResolvedValue(true)

    const result = await deleteMapAction({ mapId: MAP_ID })

    expect(result).toEqual({ ok: false, error: "map-in-use" })
    expect(deleteMap).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deletes and revalidates when no Region references it", async () => {
    const result = await deleteMapAction({ mapId: MAP_ID })

    expect(result).toEqual(ok(undefined))
    expect(deleteMap).toHaveBeenCalledWith(MAP_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/stage/maps")
  })
})
