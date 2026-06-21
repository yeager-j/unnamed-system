import { beforeEach, describe, expect, it, vi } from "vitest"

import type { MapRow } from "@/lib/db/schema/map"

import { requireMapOwner } from "./map-access"

// The gate touches two seams: the session (`auth` from ./index) and the Map
// loader. Stub both so this stays a pure unit test with no next-auth / DB chain.
// `forbidden()` normally throws a Next redirect-class error; stub it to throw a
// sentinel so rejections are assertable.
const auth = vi.fn()
const loadMapRowById = vi.fn()

vi.mock("./index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapRowById: (id: string) => loadMapRowById(id),
}))
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("forbidden")
  },
}))

const OWNER_ID = "user-owner"
const OTHER_ID = "user-other"
const MAP_ID = "map-1"

function makeMap(overrides: Partial<MapRow>): MapRow {
  return { id: MAP_ID, userId: OWNER_ID, ...overrides } as MapRow
}

function signedInAs(userId: string) {
  auth.mockResolvedValue({ user: { id: userId } })
}

describe("requireMapOwner", () => {
  beforeEach(() => {
    auth.mockReset()
    loadMapRowById.mockReset()
  })

  it("allows the owner and returns the row", async () => {
    signedInAs(OWNER_ID)
    const map = makeMap({ userId: OWNER_ID })
    loadMapRowById.mockResolvedValue(map)

    await expect(requireMapOwner(MAP_ID)).resolves.toBe(map)
  })

  it("forbids a missing session (and never queries)", async () => {
    auth.mockResolvedValue(null)

    await expect(requireMapOwner(MAP_ID)).rejects.toThrow("forbidden")
    expect(loadMapRowById).not.toHaveBeenCalled()
  })

  it("forbids a missing Map", async () => {
    signedInAs(OWNER_ID)
    loadMapRowById.mockResolvedValue(null)

    await expect(requireMapOwner(MAP_ID)).rejects.toThrow("forbidden")
  })

  it("forbids a signed-in non-owner", async () => {
    signedInAs(OTHER_ID)
    loadMapRowById.mockResolvedValue(makeMap({ userId: OWNER_ID }))

    await expect(requireMapOwner(MAP_ID)).rejects.toThrow("forbidden")
  })
})
