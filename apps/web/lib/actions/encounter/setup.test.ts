import { beforeEach, describe, expect, it, vi } from "vitest"

import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { CombatantSetup, CombatSession } from "@/lib/game/encounter"
import { err, ok } from "@/lib/result"

import { saveEncounterSetupAction } from "./setup"

// Stub the same seams as the action: the DM gate, the campaignId lookup, the
// guarded write, the full-row reload (for revalidate), and the provisional
// revalidate (which imports `server-only`). The schema + `createCombatSession`
// run for real, so the test asserts the session is built from the wire roster.
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterRowById = vi.fn()
const saveEncounterSession = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterCampaignId: (id: string) => loadEncounterCampaignId(id),
  loadEncounterRowById: (id: string) => loadEncounterRowById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (id: string, session: CombatSession, v: number) =>
    saveEncounterSession(id, session, v),
}))
vi.mock("./revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))

const ENCOUNTER_ID = "encounter-1"
const CAMPAIGN_ID = "campaign-1"

const ROSTER: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "" },
  { side: "enemies", ref: { kind: "pc", characterId: "char-2" }, zoneId: "z2" },
]

function encounterRow(): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
  } as EncounterRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterRowById.mockReset().mockResolvedValue(encounterRow())
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  revalidateEncounter.mockReset()
})

describe("saveEncounterSetupAction", () => {
  it("builds a session from the roster and saves it guarded on the version", async () => {
    const result = await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: ROSTER,
    })

    expect(result).toEqual(ok({ version: 1 }))

    const [id, session, version] = saveEncounterSession.mock.calls[0]!
    expect(id).toBe(ENCOUNTER_ID)
    expect(version).toBe(0)
    // The roster was turned into a fresh session: one combatant per setup, each
    // with a minted id and the supplied side.
    const persisted = session as CombatSession
    expect(persisted.combatants).toHaveLength(2)
    expect(persisted.combatants.map((c) => c.side)).toEqual([
      "players",
      "enemies",
    ])
    expect(persisted.combatants.every((c) => c.id.length > 0)).toBe(true)
    expect(revalidateEncounter).toHaveBeenCalledOnce()
  })

  it("rejects a malformed roster before any DB read", async () => {
    const result = await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: [{ side: "wizards" } as never],
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterCampaignId).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found before authorizing when the row is gone", async () => {
    loadEncounterCampaignId.mockResolvedValue(null)

    const result = await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: ROSTER,
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("rejects a non-DM before writing", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      saveEncounterSetupAction({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        combatants: ROSTER,
      })
    ).rejects.toThrow("forbidden")

    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a stale version and does not revalidate", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    const result = await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: ROSTER,
    })

    expect(result).toEqual(err("stale"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })
})
