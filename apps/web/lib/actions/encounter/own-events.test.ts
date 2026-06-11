import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCombatSession } from "@workspace/game/engine"
import { err, ok, type CombatSession } from "@workspace/game/foundation"

import type { EncounterRow } from "@/lib/db/schema/encounter"

import { applyOwnCombatEvent } from "./own-events"

// The action touches four seams: the per-combatant owner gate, the row load, the
// guarded write, and the ping/revalidate. Stub all of them so this stays a pure
// unit test of the orchestration — the reducer + schema + the event allow-list
// run for real. The action's *direct* `forbidden()` (enemy / unknown target) is
// `next/navigation`'s; stub it to throw a sentinel so the rejection is assertable.
const requireOwnerOrCampaignDM = vi.fn()
const loadEncounterRowByShortId = vi.fn()
const saveEncounterSession = vi.fn()
const revalidateEncounter = vi.fn()
const publishEncounterPing = vi.fn()
const forbidden = vi.fn(() => {
  throw new Error("forbidden")
})

vi.mock("next/navigation", () => ({
  forbidden: () => forbidden(),
}))
vi.mock("@/lib/auth/campaign-access", () => ({
  requireOwnerOrCampaignDM: (id: string) => requireOwnerOrCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterRowByShortId: (shortId: string) =>
    loadEncounterRowByShortId(shortId),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (id: string, session: CombatSession, v: number) =>
    saveEncounterSession(id, session, v),
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
const SHORT_ID = "enc1"

/** One PC (char-1, combatant-0) and one inline enemy (combatant-1), live. */
function liveSession(): CombatSession {
  let n = 0
  const session = createCombatSession(() => `combatant-${n++}`)([
    {
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "z",
    },
    {
      side: "enemies",
      ref: {
        kind: "enemy",
        statBlock: {
          name: "Slime",
          maxHP: 10,
          currentHP: 10,
          maxSP: 0,
          currentSP: 0,
          attributes: { strength: 1, magic: 1, agility: 1, luck: 1 },
        },
      },
      zoneId: "z",
    },
  ])
  return { ...session, currentActorId: "combatant-0" }
}

function encounterRow(session: CombatSession): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: "campaign-1",
    shortId: "enc1",
    name: "Test",
    status: "live",
    session,
    version: 3,
  } as EncounterRow
}

beforeEach(() => {
  requireOwnerOrCampaignDM.mockReset().mockResolvedValue({ id: "char-1" })
  loadEncounterRowByShortId
    .mockReset()
    .mockResolvedValue(encounterRow(liveSession()))
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 4 }))
  revalidateEncounter.mockReset()
  publishEncounterPing.mockReset()
  forbidden.mockClear()
})

describe("applyOwnCombatEvent", () => {
  it("reduces and persists an overlay event on the caller's own combatant", async () => {
    const result = await applyOwnCombatEvent({
      shortId: SHORT_ID,
      expectedVersion: 3,
      event: {
        kind: "setBattleConditionFlag",
        combatantId: "combatant-0",
        flag: "concentrating",
        value: true,
      },
    })

    expect(result).toEqual(ok({ version: 4 }))
    // Authorized against the owned combatant's character, then persisted.
    expect(requireOwnerOrCampaignDM).toHaveBeenCalledWith("char-1")
    const [id, persisted, version] = saveEncounterSession.mock.calls[0]!
    expect(id).toBe(ENCOUNTER_ID)
    expect(version).toBe(3)
    expect(
      (persisted as CombatSession).combatants[0]!.battleConditions.concentrating
    ).toBe(true)
    expect(publishEncounterPing).toHaveBeenCalledExactlyOnceWith("enc1", {
      version: 4,
      status: "live",
    })
    expect(revalidateEncounter).toHaveBeenCalledOnce()
  })

  it("rejects a non-overlay (DM-only) event with invalid-input before loading the row", async () => {
    const result = await applyOwnCombatEvent({
      shortId: SHORT_ID,
      expectedVersion: 3,
      event: { kind: "endTurn" },
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterRowByShortId).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("rejects a malformed event with invalid-input", async () => {
    const result = await applyOwnCombatEvent({
      shortId: SHORT_ID,
      expectedVersion: 3,
      event: { kind: "explode" } as never,
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterRowByShortId).not.toHaveBeenCalled()
  })

  it("forbids editing an enemy combatant — never authorizes or writes", async () => {
    await expect(
      applyOwnCombatEvent({
        shortId: SHORT_ID,
        expectedVersion: 3,
        event: {
          kind: "setBattleConditionFlag",
          combatantId: "combatant-1",
          flag: "concentrating",
          value: true,
        },
      })
    ).rejects.toThrow("forbidden")

    expect(requireOwnerOrCampaignDM).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("forbids an unknown combatant id", async () => {
    await expect(
      applyOwnCombatEvent({
        shortId: SHORT_ID,
        expectedVersion: 3,
        event: { kind: "clearAilment", combatantId: "ghost", ailment: "burn" },
      })
    ).rejects.toThrow("forbidden")

    expect(requireOwnerOrCampaignDM).not.toHaveBeenCalled()
  })

  it("propagates the forbidden() from a non-owner of the combatant", async () => {
    requireOwnerOrCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      applyOwnCombatEvent({
        shortId: SHORT_ID,
        expectedVersion: 3,
        event: {
          kind: "setAilment",
          combatantId: "combatant-0",
          ailment: "burn",
        },
      })
    ).rejects.toThrow("forbidden")

    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found when the row is gone", async () => {
    loadEncounterRowByShortId.mockResolvedValue(null)

    const result = await applyOwnCombatEvent({
      shortId: SHORT_ID,
      expectedVersion: 3,
      event: {
        kind: "setAilment",
        combatantId: "combatant-0",
        ailment: "burn",
      },
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(requireOwnerOrCampaignDM).not.toHaveBeenCalled()
  })

  it("propagates a stale write without pinging or revalidating", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    const result = await applyOwnCombatEvent({
      shortId: SHORT_ID,
      expectedVersion: 3,
      event: {
        kind: "setAilment",
        combatantId: "combatant-0",
        ailment: "burn",
      },
    })

    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })
})
