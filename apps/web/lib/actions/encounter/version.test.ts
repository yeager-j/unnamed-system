import { beforeEach, describe, expect, it, vi } from "vitest"

import { getEncounterVersionAction } from "./version"

const loadEncounterVersionByShortId = vi.fn()

vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterVersionByShortId: (shortId: string) =>
    loadEncounterVersionByShortId(shortId),
}))

describe("getEncounterVersionAction", () => {
  beforeEach(() => {
    loadEncounterVersionByShortId.mockReset()
  })

  it("returns the current version for a known shortId", async () => {
    loadEncounterVersionByShortId.mockResolvedValueOnce(7)

    const result = await getEncounterVersionAction({ shortId: "enc1" })

    expect(result).toEqual({ ok: true, value: { version: 7 } })
    expect(loadEncounterVersionByShortId).toHaveBeenCalledWith("enc1")
  })

  it("reports encounter-not-found when no row matches", async () => {
    loadEncounterVersionByShortId.mockResolvedValueOnce(null)

    const result = await getEncounterVersionAction({ shortId: "missing" })

    expect(result).toEqual({ ok: false, error: "encounter-not-found" })
  })

  it("rejects a malformed payload as invalid-input", async () => {
    const result = await getEncounterVersionAction({ shortId: "" })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadEncounterVersionByShortId).not.toHaveBeenCalled()
  })
})
