import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCombatSession } from "@workspace/game/engine"
import { err, ok, type CombatSession } from "@workspace/game/foundation"

import type { EncounterRow } from "@/lib/db/schema/encounter"

import { applyCombatEvent } from "./events"

// The action touches five seams: the DM gate, the campaignId lookup, the full
// row load, and the two guarded writes. Stub all of them (plus the provisional
// revalidate, which imports `server-only`) so this stays a pure unit test of the
// orchestration — the reducer + schema run for real. `requireCampaignDM` throws
// `forbidden()`; stub it to throw a sentinel so the rejection is assertable.
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterRowById = vi.fn()
const loadLiveEncounterForCampaign = vi.fn()
const saveEncounterSession = vi.fn()
const setEncounterStatus = vi.fn()
const revalidateEncounter = vi.fn()
const publishEncounterPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterCampaignId: (id: string) => loadEncounterCampaignId(id),
  loadEncounterRowById: (id: string) => loadEncounterRowById(id),
  loadLiveEncounterForCampaign: (id: string) =>
    loadLiveEncounterForCampaign(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (id: string, session: CombatSession, v: number) =>
    saveEncounterSession(id, session, v),
  setEncounterStatus: (id: string, status: string, v: number) =>
    setEncounterStatus(id, status, v),
}))
vi.mock("./revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
}))

const ENCOUNTER_ID = "encounter-1"
const CAMPAIGN_ID = "campaign-1"

/** A started session: one combatant drafted as the current actor, still a draft. */
function startedSession(): CombatSession {
  const session = createCombatSession(() => "combatant-0")([
    {
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "z",
    },
  ])
  return { ...session, currentActorId: "combatant-0" }
}

function encounterRow(session: CombatSession): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
    name: "Test",
    status: "draft",
    session,
    version: 0,
  } as EncounterRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterRowById
    .mockReset()
    .mockResolvedValue(encounterRow(startedSession()))
  loadLiveEncounterForCampaign.mockReset().mockResolvedValue(null)
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  setEncounterStatus.mockReset().mockResolvedValue(ok({ version: 2 }))
  revalidateEncounter.mockReset()
  publishEncounterPing.mockReset()
})

describe("applyCombatEvent", () => {
  it("rejects a non-DM before the session is loaded", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      applyCombatEvent({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        event: { kind: "endTurn" },
      })
    ).rejects.toThrow("forbidden")

    expect(requireCampaignDM).toHaveBeenCalledWith(CAMPAIGN_ID)
    expect(loadEncounterRowById).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("reduces and persists a normal event, then revalidates", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })

    expect(result).toEqual(ok({ version: 1 }))

    // The reduced session was persisted (combatant-0 marked acted), guarded on
    // the caller's version.
    const [id, persisted, version] = saveEncounterSession.mock.calls[0]!
    expect(id).toBe(ENCOUNTER_ID)
    expect(version).toBe(0)
    expect((persisted as CombatSession).combatants[0]!.hasActedThisRound).toBe(
      true
    )

    expect(setEncounterStatus).not.toHaveBeenCalled()
    expect(revalidateEncounter).toHaveBeenCalledOnce()
    // Exactly one advisory ping with the new version + unchanged status.
    expect(publishEncounterPing).toHaveBeenCalledExactlyOnceWith("enc1", {
      version: 1,
      status: "draft",
    })
  })

  it("flips status to live on startCombat, guarded on the bumped version", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(saveEncounterSession).toHaveBeenCalledOnce()
    expect(setEncounterStatus).toHaveBeenCalledWith(ENCOUNTER_ID, "live", 1)
    expect(result).toEqual(ok({ version: 2 }))
    // One ping for the whole action despite the two guarded writes, carrying
    // the final version and the flipped status.
    expect(publishEncounterPing).toHaveBeenCalledExactlyOnceWith("enc1", {
      version: 2,
      status: "live",
    })
  })

  it("rejects startCombat when the campaign already has a different live encounter", async () => {
    loadLiveEncounterForCampaign.mockResolvedValue({ id: "other-encounter" })

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(result).toEqual(err("campaign-already-has-live-encounter"))
    // Rejected before any write.
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("allows startCombat when the only live encounter is this one (idempotent re-issue)", async () => {
    loadLiveEncounterForCampaign.mockResolvedValue({ id: ENCOUNTER_ID })

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(result).toEqual(ok({ version: 2 }))
    expect(setEncounterStatus).toHaveBeenCalledWith(ENCOUNTER_ID, "live", 1)
  })

  it("propagates a stale version and does not flip status or revalidate", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(result).toEqual(err("stale"))
    expect(setEncounterStatus).not.toHaveBeenCalled()
    expect(revalidateEncounter).not.toHaveBeenCalled()
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("rejects a malformed event before any DB read", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "explode" } as never,
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterCampaignId).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found before authorizing when the row is gone", async () => {
    loadEncounterCampaignId.mockResolvedValue(null)

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(requireCampaignDM).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found when the row is deleted between the two reads", async () => {
    loadEncounterRowById.mockResolvedValue(null)

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a setEncounterStatus failure on startCombat without revalidating", async () => {
    setEncounterStatus.mockResolvedValue(err("encounter-not-found"))

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(saveEncounterSession).toHaveBeenCalledOnce()
    expect(result).toEqual(err("encounter-not-found"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })
})
