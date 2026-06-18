import { beforeEach, describe, expect, it, vi } from "vitest"

import { getDungeonVersionAction } from "./version"

const loadDungeonVersionByShortId = vi.fn()

vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonVersionByShortId: (shortId: string) =>
    loadDungeonVersionByShortId(shortId),
}))

describe("getDungeonVersionAction", () => {
  beforeEach(() => {
    loadDungeonVersionByShortId.mockReset()
  })

  it("returns the current version for a known shortId", async () => {
    loadDungeonVersionByShortId.mockResolvedValueOnce(4)

    const result = await getDungeonVersionAction({ shortId: "dng1" })

    expect(result).toEqual({ ok: true, value: { version: 4 } })
    expect(loadDungeonVersionByShortId).toHaveBeenCalledWith("dng1")
  })

  it("reports dungeon-not-found when no row matches", async () => {
    loadDungeonVersionByShortId.mockResolvedValueOnce(null)

    const result = await getDungeonVersionAction({ shortId: "missing" })

    expect(result).toEqual({ ok: false, error: "dungeon-not-found" })
  })

  it("rejects a malformed payload as invalid-input", async () => {
    const result = await getDungeonVersionAction({ shortId: "" })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonVersionByShortId).not.toHaveBeenCalled()
  })
})
