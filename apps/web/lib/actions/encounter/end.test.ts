import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/game/foundation/result"

import type { EncounterRow } from "@/lib/db/schema/encounter"

import { endEncounterAction } from "./end"

// The action touches four seams: the campaignId lookup, the DM gate, the guarded
// status write, and (for revalidation) the row load. Stub all of them (plus the
// `server-only` revalidate) so this stays a pure unit test of the orchestration.
// `requireCampaignDM` throws `forbidden()`; stub it to throw a sentinel so the
// rejection is assertable.
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterRowById = vi.fn()
const setEncounterStatus = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterCampaignId: (id: string) => loadEncounterCampaignId(id),
  loadEncounterRowById: (id: string) => loadEncounterRowById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  setEncounterStatus: (id: string, status: string, v: number) =>
    setEncounterStatus(id, status, v),
}))
vi.mock("./revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))

const ENCOUNTER_ID = "enc-1"
const CAMPAIGN_ID = "camp-1"

const encounterRow = { id: ENCOUNTER_ID, shortId: "enc1" } as EncounterRow

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterRowById.mockReset().mockResolvedValue(encounterRow)
  setEncounterStatus.mockReset().mockResolvedValue(ok({ version: 3 }))
  revalidateEncounter.mockReset()
})

describe("endEncounterAction", () => {
  it("flips status to ended guarded on the caller's version, then revalidates", async () => {
    const result = await endEncounterAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 2,
    })

    expect(result).toEqual(ok({ version: 3 }))
    expect(setEncounterStatus).toHaveBeenCalledWith(ENCOUNTER_ID, "ended", 2)
    expect(revalidateEncounter).toHaveBeenCalledWith(encounterRow)
  })

  it("rejects a non-DM before writing", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      endEncounterAction({ encounterId: ENCOUNTER_ID, expectedVersion: 0 })
    ).rejects.toThrow("forbidden")

    expect(requireCampaignDM).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found without calling the DM gate", async () => {
    loadEncounterCampaignId.mockResolvedValue(null)

    const result = await endEncounterAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("propagates a stale guarded-write error and skips revalidation", async () => {
    setEncounterStatus.mockResolvedValue(err("stale"))

    const result = await endEncounterAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 1,
    })

    expect(result).toEqual(err("stale"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })

  it("rejects an invalid payload before any I/O", async () => {
    const result = await endEncounterAction({
      encounterId: "",
      expectedVersion: -1,
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterCampaignId).not.toHaveBeenCalled()
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })
})
