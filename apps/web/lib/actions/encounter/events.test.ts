import { beforeEach, describe, expect, it, vi } from "vitest"

import { createCombatSession, createMapInstance } from "@workspace/game/engine"
import {
  err,
  ok,
  type CombatSession,
  type MapInstanceState,
} from "@workspace/game/foundation"

import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import { applyCombatEvent } from "./events"

// The action touches several seams: the DM gate, the campaignId lookup, the full
// encounter + Instance loads, and the guarded session / Instance / status writes
// (composed in a `guardMany` transaction on the start + cross-write paths). Stub
// all of them (plus the provisional revalidate, which imports `server-only`) so
// this stays a pure unit test of the orchestration — the reducers + schema run
// for real. `requireCampaignDM` throws `forbidden()`; stub it to throw a sentinel
// so the rejection is assertable. `guardMany` runs its body inline with a
// sentinel executor (the per-write mocks ignore it), and propagates an `err`
// body the same way the real one does (returns it as the result).
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const loadLiveEncounterForCampaign = vi.fn()
const saveEncounterSession = vi.fn()
const saveMapInstanceState = vi.fn()
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
  setEncounterStatus: (id: string, status: string, v: number, tx: unknown) =>
    setEncounterStatus(id, status, v, tx),
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
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
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
const MAP_INSTANCE_ID = "mi-1"

/** A started session: one combatant drafted as the current actor, still a draft. */
function startedSession(): CombatSession {
  const session = createCombatSession(() => "combatant-0")([
    {
      id: "combatant-0",
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "z",
    },
  ])
  return { ...session, currentActorId: "combatant-0" }
}

/** The matching Instance: the one combatant placed in zone `z`. */
function placedInstanceState(): MapInstanceState {
  return createMapInstance(() => "combatant-0")([
    {
      id: "combatant-0",
      side: "players",
      ref: { kind: "pc", characterId: "char-1" },
      zoneId: "z",
    },
  ])
}

function encounterRow(session: CombatSession): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
    name: "Test",
    status: "draft",
    mapInstanceId: MAP_INSTANCE_ID,
    session,
    version: 0,
  } as EncounterRow
}

function instanceRow(state: MapInstanceState): MapInstanceRow {
  return { id: MAP_INSTANCE_ID, state, version: 0 } as MapInstanceRow
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterRowById
    .mockReset()
    .mockResolvedValue(encounterRow(startedSession()))
  loadMapInstanceById
    .mockReset()
    .mockResolvedValue(instanceRow(placedInstanceState()))
  loadLiveEncounterForCampaign.mockReset().mockResolvedValue(null)
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 1 }))
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
    // the caller's version. The single-row path passes no transaction executor.
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

  it("routes a spatial event to the Instance write and fires no ping (poll-only)", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: {
        kind: "moveCombatant",
        combatantId: "combatant-0",
        toZoneId: "z",
      },
    })

    // Returns the bumped Instance version; the session row is never touched.
    expect(result).toEqual(ok({ version: 1 }))
    const [, id, , version] = saveMapInstanceState.mock.calls[0]!
    expect(id).toBe(MAP_INSTANCE_ID)
    expect(version).toBe(0)
    expect(saveEncounterSession).not.toHaveBeenCalled()
    // Spatial writes are poll-only for M0 — no realtime ping.
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(revalidateEncounter).toHaveBeenCalledOnce()
  })

  it("returns missing-instance-version when a spatial event omits the Instance token", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "clearEnchantment" },
    })

    expect(result).toEqual(err("missing-instance-version"))
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("cross-writes session + Instance on addCombatant in one transaction", async () => {
    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: {
        kind: "addCombatant",
        setup: {
          id: "new-enemy",
          side: "enemies",
          ref: { kind: "catalog-enemy", enemyKey: "goblin" },
          zoneId: "z",
        },
      },
    })

    expect(result).toEqual(ok({ version: 1 }))
    // Both rows written, both guarded on their respective versions.
    const [encId, session, encVersion] = saveEncounterSession.mock.calls[0]!
    expect(encId).toBe(ENCOUNTER_ID)
    expect(encVersion).toBe(0)
    expect((session as CombatSession).combatants).toHaveLength(2)
    const [, miId, state, miVersion] = saveMapInstanceState.mock.calls[0]!
    expect(miId).toBe(MAP_INSTANCE_ID)
    expect(miVersion).toBe(0)
    expect((state as MapInstanceState).occupancy["new-enemy"]?.zoneId).toBe("z")
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
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "live",
      1,
      "tx"
    )
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
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "live",
      1,
      "tx"
    )
  })

  it("rejects startCombat when zones are defined and a combatant is unplaced (UNN-347)", async () => {
    // Zones + occupancy now live on the Instance: the placed token is moved out.
    const unplaced: MapInstanceState = {
      ...placedInstanceState(),
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
      occupancy: {
        "combatant-0": { zoneId: "", engagement: { status: "free" } },
      },
    }
    loadMapInstanceById.mockResolvedValue(instanceRow(unplaced))

    const result = await applyCombatEvent({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "startCombat",
        advantage: "players",
        firstSide: "players",
      },
    })

    expect(result).toEqual(err("encounter-has-unplaced-combatants"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("allows startCombat when zones are defined and every combatant is placed", async () => {
    const placed: MapInstanceState = {
      ...placedInstanceState(),
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
      occupancy: {
        "combatant-0": { zoneId: "zone-a", engagement: { status: "free" } },
      },
    }
    loadMapInstanceById.mockResolvedValue(instanceRow(placed))

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
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "live",
      1,
      "tx"
    )
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
