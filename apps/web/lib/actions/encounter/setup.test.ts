import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCombatSession } from "@workspace/game/engine"
import {
  err,
  ok,
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation"

import type { EncounterRow } from "@/lib/db/schema/encounter"

import { addSetupCombatantsAction } from "./setup"

// Stub the same seams as the action: the DM gate, the full-row load, the guarded
// write, and the provisional revalidate (which imports `server-only`). The schema
// + the real `reduceCombatSession` (via the action) run for real, so the test
// asserts the new combatants were appended to the loaded session.
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

const NEW_ENEMIES: CombatantSetup[] = [
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "",
  },
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "",
  },
]

/** A persisted session carrying one PC combatant and an authored zone graph. */
function persistedSession(): CombatSession {
  const base = createCombatSession(() => "pc-combatant")([
    { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "" },
  ])
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
    .mockResolvedValue(encounterRow(persistedSession()))
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  revalidateEncounter.mockReset()
})

describe("addSetupCombatantsAction", () => {
  it("appends the new combatants to the loaded roster, keeping the existing ones", async () => {
    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: NEW_ENEMIES,
    })

    expect(result).toEqual(ok({ version: 1 }))

    const [id, session, version] = saveEncounterSession.mock.calls[0]!
    expect(id).toBe(ENCOUNTER_ID)
    expect(version).toBe(0)
    const persisted = session as CombatSession
    expect(persisted.combatants).toHaveLength(3)
    expect(persisted.combatants[0]!.id).toBe("pc-combatant")
    expect(persisted.combatants.slice(1).map((c) => c.ref)).toEqual(
      NEW_ENEMIES.map((e) => e.ref)
    )
    expect(revalidateEncounter).toHaveBeenCalledOnce()
  })

  it("preserves the persisted zone graph (appends, never rebuilds)", async () => {
    await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: NEW_ENEMIES,
    })

    const persisted = saveEncounterSession.mock.calls[0]![1] as CombatSession
    expect(persisted.zones).toEqual({
      "zone-a": { id: "zone-a", name: "Courtyard" },
    })
    expect(persisted.adjacency).toEqual({ "zone-a": [] })
  })

  it("rejects a malformed roster before any DB read", async () => {
    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: [{ side: "wizards" } as never],
    })

    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterRowById).not.toHaveBeenCalled()
  })

  it("returns encounter-not-found before authorizing when the row is gone", async () => {
    loadEncounterRowById.mockResolvedValue(null)

    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: NEW_ENEMIES,
    })

    expect(result).toEqual(err("encounter-not-found"))
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("rejects a non-DM before writing", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      addSetupCombatantsAction({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        combatants: NEW_ENEMIES,
      })
    ).rejects.toThrow("forbidden")

    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a stale version and does not revalidate", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      combatants: NEW_ENEMIES,
    })

    expect(result).toEqual(err("stale"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })
})
