import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCombatSession, createMapInstance } from "@workspace/game/engine"
import {
  err,
  ok,
  type CombatantSetup,
  type CombatSession,
  type MapInstanceState,
} from "@workspace/game/foundation"

import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import { addSetupCombatantsAction } from "./setup"

// Stub the same seams as the action: the DM gate, the encounter + Instance loads,
// the two guarded writes, the `guardMany` transaction wrapper (run inline with a
// dummy executor), and the provisional revalidate (imports `server-only`). The
// schema + the real `reduceCombatSession`/`addOccupant` (via the action) run for
// real, so the test asserts the new combatants were appended to **both** rows.
const requireCampaignDM = vi.fn()
const loadEncounterRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const saveEncounterSession = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateEncounter = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterRowById: (id: string) => loadEncounterRowById(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (
    id: string,
    session: CombatSession,
    v: number,
    tx: unknown
  ) => saveEncounterSession(id, session, v, tx),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (
    tx: unknown,
    id: string,
    state: MapInstanceState,
    v: number
  ) => saveMapInstanceState(tx, id, state, v),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  // Run the body inline with a sentinel executor; the per-write mocks ignore it.
  guardMany: (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("./revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))

const ENCOUNTER_ID = "encounter-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"

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

/** A persisted session carrying one PC combatant. */
function persistedSession(): CombatSession {
  return createCombatSession(() => "pc-combatant")([
    {
      id: "pc-combatant",
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "",
    },
  ])
}

/** The Instance's state carrying the PC's token + an authored zone graph. */
function persistedInstanceState(): MapInstanceState {
  const base = createMapInstance(() => "pc-combatant")([
    {
      id: "pc-combatant",
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "zone-a",
    },
  ])
  return {
    ...base,
    geometry: {
      zones: {
        "zone-a": {
          id: "zone-a",
          name: "Courtyard",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
        },
      },
      connections: {},
    },
  }
}

function encounterRow(session: CombatSession): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
    mapInstanceId: MAP_INSTANCE_ID,
    session,
  } as EncounterRow
}

function instanceRow(state: MapInstanceState): MapInstanceRow {
  return { id: MAP_INSTANCE_ID, state, version: 0 } as MapInstanceRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterRowById
    .mockReset()
    .mockResolvedValue(encounterRow(persistedSession()))
  loadMapInstanceById
    .mockReset()
    .mockResolvedValue(instanceRow(persistedInstanceState()))
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 1 }))
  revalidateEncounter.mockReset()
})

describe("addSetupCombatantsAction", () => {
  it("appends the new combatants to the loaded roster, keeping the existing ones", async () => {
    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
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

  it("places an occupancy token for each new combatant on the Instance", async () => {
    await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      combatants: NEW_ENEMIES,
    })

    const [, id, state, version] = saveMapInstanceState.mock.calls[0]!
    expect(id).toBe(MAP_INSTANCE_ID)
    expect(version).toBe(0)
    const persisted = state as MapInstanceState
    // The PC token survives untouched; the two enemies each gained a token.
    expect(Object.keys(persisted.occupancy)).toHaveLength(3)
    expect(persisted.occupancy["pc-combatant"]?.zoneId).toBe("zone-a")
  })

  it("preserves the persisted zone graph (appends, never rebuilds)", async () => {
    await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      combatants: NEW_ENEMIES,
    })

    const persisted = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState
    expect(persisted.geometry.zones).toEqual({
      "zone-a": {
        id: "zone-a",
        name: "Courtyard",
        description: "",
        dmNotes: "",
        position: { x: 0, y: 0 },
      },
    })
    expect(persisted.geometry.connections).toEqual({})
  })

  it("rejects a malformed roster before any DB read", async () => {
    const result = await addSetupCombatantsAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
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
      expectedInstanceVersion: 0,
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
        expectedInstanceVersion: 0,
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
      expectedInstanceVersion: 0,
      combatants: NEW_ENEMIES,
    })

    expect(result).toEqual(err("stale"))
    expect(revalidateEncounter).not.toHaveBeenCalled()
  })
})
