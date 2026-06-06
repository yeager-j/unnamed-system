import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createCombatSession,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/encounter"
import { err, ok } from "@workspace/game/foundation/result"

import type { EncounterRow } from "@/lib/db/schema/encounter"

import { saveEncounterSetupAction } from "./setup"

// Stub the same seams as the action: the DM gate, the full-row load (used for
// both auth and zone preservation), the guarded write, and the provisional
// revalidate (which imports `server-only`). The schema + `createCombatSession`
// run for real, so the test asserts the session is built from the wire roster.
const requireCampaignDM = vi.fn()
const loadEncounterRowById = vi.fn()
const saveEncounterSession = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
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

/** A persisted session carrying an authored zone graph the roster save must keep. */
function persistedSessionWithZones(): CombatSession {
  const base = createCombatSession([])
  return {
    ...base,
    zones: { "zone-a": { id: "zone-a", name: "Courtyard" } },
    adjacency: { "zone-a": [] },
  }
}

function encounterRow(session: CombatSession): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
    session,
  } as EncounterRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterRowById
    .mockReset()
    .mockResolvedValue(encounterRow(persistedSessionWithZones()))
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

  it("preserves a setup-supplied combatant id over a fresh mint (UNN-301)", async () => {
    await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: [{ ...ROSTER[0]!, id: "stable-1" }],
    })

    const persisted = saveEncounterSession.mock.calls[0]![1] as CombatSession
    expect(persisted.combatants[0]!.id).toBe("stable-1")
  })

  it("carries the persisted zone graph forward instead of wiping it (UNN-301)", async () => {
    // Zones are authored on a separate ZoneGraphEvent path; rebuilding the
    // session from the roster alone would erase them. The action must merge them.
    await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: ROSTER,
    })

    const persisted = saveEncounterSession.mock.calls[0]![1] as CombatSession
    expect(persisted.zones).toEqual({
      "zone-a": { id: "zone-a", name: "Courtyard" },
    })
    expect(persisted.adjacency).toEqual({ "zone-a": [] })
  })

  it("rejects a malformed roster before any DB read", async () => {
    const result = await saveEncounterSetupAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: [{ side: "wizards" } as never],
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterRowById).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found before authorizing when the row is gone", async () => {
    loadEncounterRowById.mockResolvedValue(null)

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
