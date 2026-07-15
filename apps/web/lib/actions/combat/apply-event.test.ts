import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type LoadedSession,
  type Session,
  type StoredEntityLocator,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/game-v2/kernel/result"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { LoadedEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { applyCombatEventAction } from "./apply-event"

// The action touches the same seams as v1's `events.test.ts`: the DM gate, the
// campaignId lookup, the v2 write-path loader, the Instance load, and the
// guarded blob / Instance / status writes (composed in `guardMany` on the
// paired + start paths). Stub all of them so this stays a pure unit test of the
// orchestration — the v2 reducers, paired helpers, and the fail-closed saver
// run for real.
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterForWrite = vi.fn()
const loadLiveEncounterIdForCampaign = vi.fn()
const loadMapInstanceById = vi.fn()
const loadLiveEntityRowById = vi.fn()
const saveEncounterSession = vi.fn()
const saveMapInstanceState = vi.fn()
const setEncounterStatus = vi.fn()
const revalidateEncounter = vi.fn()
const publishEncounterPing = vi.fn()
const publishEncounterInstancePing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterCampaignId: (id: string) => loadEncounterCampaignId(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (id: string) => loadEncounterForWrite(id),
  loadLiveEncounterIdForCampaign: (id: string) =>
    loadLiveEncounterIdForCampaign(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/queries/load-entity", () => ({
  loadLiveEntityRowById: (id: string) => loadLiveEntityRowById(id),
}))
vi.mock("@/domain/game-v2/entity-row-to-bag", () => ({
  loadEntityRow: (row: { id: string }) => ({
    ok: true,
    value: { id: row.id, components: { vitals: { base: 20, damage: 0 } } },
  }),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  setEncounterStatus: (id: string, status: string, v: number, tx: unknown) =>
    setEncounterStatus(id, status, v, tx),
  saveEncounterSession: (
    id: string,
    stored: StoredSession,
    v: number,
    tx: unknown
  ) => saveEncounterSession(id, stored, v, tx),
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
vi.mock("@/lib/db/client", () => ({ db: "db" }))
vi.mock("../encounter/revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
  publishEncounterInstancePing: (shortId: string, version: number) =>
    publishEncounterInstancePing(shortId, version),
}))

const ENCOUNTER_ID = "encounter-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"
const PC_ID = asParticipantId("c-pc")
const GOBLIN_ID = asParticipantId("c-goblin")

/** One durable PC + one inline goblin, both placed in zone `z`. */
function makeSession(): Session {
  return {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [
      makeParticipant(
        {
          id: "char-1",
          components: {
            identity: { name: "Iris" },
            vitals: { base: 30, damage: 10 },
          },
        },
        PC_ID,
        { side: "players" }
      ),
      makeParticipant(
        { id: "goblin-1", components: { vitals: { base: 16, damage: 3 } } },
        GOBLIN_ID,
        { side: "enemies" }
      ),
    ],
  }
}

function makeLocators(): Map<ParticipantId, StoredEntityLocator> {
  return new Map<ParticipantId, StoredEntityLocator>([
    [PC_ID, { storage: "durable", entityId: "char-1" }],
    [
      GOBLIN_ID,
      {
        storage: "inline",
        entity: {
          id: "goblin-1",
          components: { vitals: { base: 16, damage: 3 } },
        },
      },
    ],
  ])
}

function makeInstanceState(): MapInstanceState {
  return {
    geometry: {
      zones: {
        z: {
          id: "z",
          name: "Zone",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
        },
      },
      connections: {},
    },
    occupancy: {
      [PC_ID]: { zoneId: "z", engagement: { status: "free" } },
      [GOBLIN_ID]: { zoneId: "z", engagement: { status: "free" } },
    },
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  }
}

function makeRow(status: EncounterRow["status"] = "draft"): EncounterRow {
  return {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    shortId: "enc1",
    name: "Test",
    status,
    mapInstanceId: MAP_INSTANCE_ID,
    session: { round: 1 },
    version: 0,
  } as EncounterRow
}

function makeLoaded(
  overrides: Partial<{
    row: EncounterRow
    session: Session
    locators: LoadedSession["locators"]
  }> = {}
): LoadedEncounterForWrite {
  return {
    row: overrides.row ?? makeRow(),
    loaded: {
      session: overrides.session ?? makeSession(),
      locators: overrides.locators ?? makeLocators(),
    },
    durableVersions: new Map([["char-1", 3]]),
  }
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterForWrite.mockReset().mockResolvedValue(ok(makeLoaded()))
  loadLiveEncounterIdForCampaign.mockReset().mockResolvedValue(null)
  loadMapInstanceById.mockReset().mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: makeInstanceState(),
    version: 0,
  })
  loadLiveEntityRowById.mockReset().mockResolvedValue(null)
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 1 }))
  setEncounterStatus.mockReset().mockResolvedValue(ok({ version: 2 }))
  revalidateEncounter.mockReset()
  publishEncounterPing.mockReset()
  publishEncounterInstancePing.mockReset()
})

/** The last blob handed to the guarded session write. */
function lastSavedBlob(): StoredSession {
  const calls = saveEncounterSession.mock.calls
  return calls[calls.length - 1]![1] as StoredSession
}

describe("applyCombatEventAction — auth + parse boundary", () => {
  it("rejects a non-DM before any state is loaded", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      applyCombatEventAction({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        event: { kind: "endTurn" },
      })
    ).rejects.toThrow("forbidden")
    expect(loadEncounterForWrite).not.toHaveBeenCalled()
  })

  it("rejects malformed input without touching the db", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      // @ts-expect-error — deliberately malformed
      event: { kind: "nope" },
    })
    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterCampaignId).not.toHaveBeenCalled()
  })

  it.each(["damageParticipant", "healParticipant", "setParticipantMax"])(
    "the envelope rejects the router-only ComponentWriteEvent kind %s (CD19)",
    async (kind) => {
      const result = await applyCombatEventAction({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        // @ts-expect-error — unrepresentable on the generic wire by design
        event: { kind, participantId: PC_ID, pool: "hp", amount: 3 },
      })
      expect(result).toEqual(err("invalid-input"))
      expect(saveEncounterSession).not.toHaveBeenCalled()
    }
  )
})

describe("applyCombatEventAction — generic session events", () => {
  it("reduces + saves the blob, fires the encounter ping", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "setAilment", participantId: PC_ID, ailment: "burn" },
    })

    expect(result).toEqual(ok({ version: 1 }))
    const blob = lastSavedBlob()
    const pc = blob.participants.find((p) => p.id === PC_ID)!
    expect((pc.overlay as { ailments: string[] }).ailments).toEqual(["burn"])
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 1,
      status: "draft",
    })
  })

  it("persists a durable participant as a reference, never embedded", async () => {
    await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })
    const blob = lastSavedBlob()
    expect(blob.participants.find((p) => p.id === PC_ID)!.locator).toEqual({
      storage: "durable",
      entityId: "char-1",
    })
  })

  it("fails closed (locator-missing) when a participant has no locator", async () => {
    loadEncounterForWrite.mockResolvedValue(
      ok(makeLoaded({ locators: new Map() }))
    )
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })
    expect(result).toEqual(err("locator-missing"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a stale guarded write", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "endTurn" },
    })
    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })
})

describe("applyCombatEventAction — spatial events", () => {
  it("routes a spatial event to the v2 spatial reducer + Instance write", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: { kind: "moveCombatant", tokenKey: PC_ID, toZoneId: "z" },
    })

    expect(result).toEqual(ok({ version: 1 }))
    expect(saveEncounterSession).not.toHaveBeenCalled()
    expect(saveMapInstanceState).toHaveBeenCalledWith(
      "db",
      MAP_INSTANCE_ID,
      expect.anything(),
      0
    )
    expect(publishEncounterInstancePing).toHaveBeenCalledWith("enc1", 1)
  })

  it("requires the Instance token for a spatial event", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: { kind: "clearEnchantment" },
    })
    expect(result).toEqual(err("missing-instance-version"))
  })
})

describe("applyCombatEventAction — paired roster cross-writes", () => {
  it("adds an inline participant: roster + token in one transaction, inline locator registered", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: {
        kind: "addParticipant",
        setup: {
          id: asParticipantId("c-new"),
          side: "enemies",
          zoneId: "z",
          entity: {
            id: "goblin-2",
            components: { vitals: { base: 10, damage: 0 } },
          },
        },
      },
    })

    expect(result).toEqual(ok({ version: 1, instanceVersion: 1 }))
    const blob = lastSavedBlob()
    const joiner = blob.participants.find((p) => p.id === "c-new")!
    expect(joiner.locator).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-2",
        components: { vitals: { base: 10, damage: 0 } },
      },
    })
    const savedInstance = saveMapInstanceState.mock
      .calls[0]![2] as MapInstanceState
    expect(savedInstance.occupancy["c-new"]).toEqual({
      zoneId: "z",
      engagement: { status: "free" },
    })
  })

  it("adds a durable mid-combat joiner (R6.2): hydrates the row + registers the durable locator", async () => {
    loadLiveEntityRowById.mockResolvedValue({ id: "char-2", name: "Momo" })

    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: {
        kind: "addParticipant",
        setup: {
          id: asParticipantId("c-momo"),
          side: "players",
          zoneId: "z",
          entityId: "char-2",
        },
      },
    })

    expect(result).toEqual(ok({ version: 1, instanceVersion: 1 }))
    expect(loadLiveEntityRowById).toHaveBeenCalledWith("char-2")
    const blob = lastSavedBlob()
    const joiner = blob.participants.find((p) => p.id === "c-momo")!
    expect(joiner.locator).toEqual({ storage: "durable", entityId: "char-2" })
    const savedInstance = saveMapInstanceState.mock
      .calls[0]![2] as MapInstanceState
    expect(savedInstance.occupancy["c-momo"]).toEqual({
      zoneId: "z",
      engagement: { status: "free" },
    })
  })

  it("rejects a durable joiner whose character row is gone", async () => {
    loadLiveEntityRowById.mockResolvedValue(null)
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: {
        kind: "addParticipant",
        setup: { side: "players", zoneId: "z", entityId: "ghost" },
      },
    })
    expect(result).toEqual(err("character-not-found"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("adds a zone-less participant session-only: no token, Instance row untouched (add-then-place)", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: {
        kind: "addParticipant",
        setup: {
          id: asParticipantId("c-unplaced"),
          side: "enemies",
          entity: {
            id: "goblin-3",
            components: { vitals: { base: 10, damage: 0 } },
          },
        },
      },
    })

    expect(result).toEqual(ok({ version: 1 }))
    const blob = lastSavedBlob()
    const joiner = blob.participants.find((p) => p.id === "c-unplaced")!
    expect(joiner.locator).toEqual({
      storage: "inline",
      entity: {
        id: "goblin-3",
        components: { vitals: { base: 10, damage: 0 } },
      },
    })
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("removes a participant: roster slot + token drop together", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 0,
      event: { kind: "removeParticipant", participantId: GOBLIN_ID },
    })

    expect(result).toEqual(ok({ version: 1, instanceVersion: 1 }))
    const blob = lastSavedBlob()
    expect(blob.participants.map((p) => p.id)).toEqual([PC_ID])
    const savedInstance = saveMapInstanceState.mock
      .calls[0]![2] as MapInstanceState
    expect(savedInstance.occupancy[GOBLIN_ID]).toBeUndefined()
    expect(savedInstance.occupancy[PC_ID]).toBeDefined()
  })

  it("propagates a stale Instance write from inside the transaction", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      expectedInstanceVersion: 5,
      event: { kind: "removeParticipant", participantId: GOBLIN_ID },
    })
    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })
})

describe("applyCombatEventAction — startCombat", () => {
  const startEvent = {
    kind: "startCombat",
    advantage: "players",
    firstSide: "players",
  } as const

  it("rejects when another encounter in the campaign is live", async () => {
    loadLiveEncounterIdForCampaign.mockResolvedValue("other-encounter")
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: startEvent,
    })
    expect(result).toEqual(err("campaign-already-has-live-encounter"))
  })

  it("rejects when zones are defined and a participant is unplaced", async () => {
    const state = makeInstanceState()
    delete state.occupancy[GOBLIN_ID]
    loadMapInstanceById.mockResolvedValue({
      id: MAP_INSTANCE_ID,
      state,
      version: 0,
    })

    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: startEvent,
    })
    expect(result).toEqual(err("encounter-has-unplaced-combatants"))
  })

  it("saves the started session + flips draft → live atomically", async () => {
    const result = await applyCombatEventAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      event: startEvent,
    })

    expect(result).toEqual(ok({ version: 2 }))
    const blob = lastSavedBlob()
    expect(blob.advantage).toBe("players")
    expect(blob.firstSide).toBe("players")
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "live",
      1,
      "tx"
    )
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 2,
      status: "live",
    })
  })
})
