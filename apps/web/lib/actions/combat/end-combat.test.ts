import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  defaultOverlay,
  makeParticipant,
  type Session,
  type StoredEntityLocator,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/result"

import type { LoadedEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { endCombatAction } from "./end-combat"

const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterForWrite = vi.fn()
const loadMapInstanceById = vi.fn()
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
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
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

/** A mid-fight session: the PC carries an ailment, the goblin a condition. */
function makeDirtySession(): Session {
  const session: Session = {
    round: 3,
    currentActorId: PC_ID,
    advantage: "players",
    firstSide: "players",
    participants: [
      makeParticipant(
        {
          id: "char-1",
          components: { vitals: { base: 30, damage: 10 } },
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
  session.participants[0]!.overlay.ailments = ["burn"]
  session.participants[1]!.overlay.battleConditions.attack = "increased"
  return session
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

/** Both tokens placed; the goblin engaged with the PC; an active enchantment. */
function makeInstanceState(): MapInstanceState {
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {
        z: {
          id: "z",
          name: "Zone",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: "default",
        },
      },
      connections: {},
    },
    occupancy: {
      [PC_ID]: {
        zoneId: "z",
        engagement: { status: "engaged", targetCombatantIds: [GOBLIN_ID] },
      },
      [GOBLIN_ID]: {
        zoneId: "z",
        engagement: { status: "engaged", targetCombatantIds: [PC_ID] },
      },
    },
    enchantment: { type: "toccata", zoneId: "z", forte: 1 },
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
    lastMovedTokenKey: null,
  }
}

function makeLoaded(status: EncounterRow["status"]): LoadedEncounterForWrite {
  return {
    row: {
      id: ENCOUNTER_ID,
      campaignId: CAMPAIGN_ID,
      shortId: "enc1",
      name: "Test",
      status,
      mapInstanceId: MAP_INSTANCE_ID,
      session: { round: 3 },
      version: 4,
    } as EncounterRow,
    loaded: { session: makeDirtySession(), locators: makeLocators() },
    durableVersions: new Map([["char-1", 3]]),
  }
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterForWrite.mockReset().mockResolvedValue(ok(makeLoaded("live")))
  loadMapInstanceById.mockReset().mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: makeInstanceState(),
    version: 7,
  })
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 5 }))
  saveMapInstanceState.mockReset().mockResolvedValue(ok({ version: 8 }))
  setEncounterStatus.mockReset().mockResolvedValue(ok({ version: 6 }))
  revalidateEncounter.mockReset()
  publishEncounterPing.mockReset()
  publishEncounterInstancePing.mockReset()
})

const INPUT = {
  encounterId: ENCOUNTER_ID,
  expectedVersion: 4,
  expectedInstanceVersion: 7,
}

describe("endCombatAction — the composed combat-end (CD16)", () => {
  it("saves the SWEPT session: every overlay fresh, sides preserved", async () => {
    const result = await endCombatAction(INPUT)
    expect(result).toEqual(ok({ version: 6, instanceVersion: 8 }))

    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    const pc = blob.participants.find((p) => p.id === PC_ID)!
    const goblin = blob.participants.find((p) => p.id === GOBLIN_ID)!
    expect(pc.overlay).toEqual(defaultOverlay({ side: "players" }))
    expect(goblin.overlay).toEqual(defaultOverlay({ side: "enemies" }))
  })

  it("keeps durable references + inline live state through the sweep", async () => {
    await endCombatAction(INPUT)
    const blob = saveEncounterSession.mock.calls[0]![1] as StoredSession
    expect(blob.participants.find((p) => p.id === PC_ID)!.locator).toEqual({
      storage: "durable",
      entityId: "char-1",
    })
    expect(
      blob.participants.find((p) => p.id === GOBLIN_ID)!.locator.storage
    ).toBe("inline")
  })

  it("prunes the Instance on the lifecycle axis: inline tokens drop, durable persist freed", async () => {
    await endCombatAction(INPUT)

    const pruned = saveMapInstanceState.mock.calls[0]![2] as MapInstanceState
    expect(pruned.occupancy[GOBLIN_ID]).toBeUndefined()
    expect(pruned.occupancy[PC_ID]).toEqual({
      zoneId: "z",
      engagement: { status: "free" },
    })
    expect(pruned.enchantment).toBeNull()
  })

  it("flips the status to ended inside the same transaction and pings both streams", async () => {
    await endCombatAction(INPUT)

    expect(saveEncounterSession).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      expect.anything(),
      4,
      "tx"
    )
    expect(setEncounterStatus).toHaveBeenCalledWith(
      ENCOUNTER_ID,
      "ended",
      5,
      "tx"
    )
    expect(saveMapInstanceState).toHaveBeenCalledWith(
      "tx",
      MAP_INSTANCE_ID,
      expect.anything(),
      7
    )
    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 6,
      status: "ended",
    })
    expect(publishEncounterInstancePing).toHaveBeenCalledWith("enc1", 8)
  })

  it("rejects a non-live encounter", async () => {
    loadEncounterForWrite.mockResolvedValue(ok(makeLoaded("draft")))
    const result = await endCombatAction(INPUT)
    expect(result).toEqual(err("encounter-not-live"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("fails closed when a participant has no locator", async () => {
    const loaded = makeLoaded("live")
    loaded.loaded.locators.delete(GOBLIN_ID)
    loadEncounterForWrite.mockResolvedValue(ok(loaded))

    const result = await endCombatAction(INPUT)
    expect(result).toEqual(err("locator-missing"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("propagates a stale Instance write and fires no pings (rollback path)", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))
    const result = await endCombatAction(INPUT)
    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
    expect(publishEncounterInstancePing).not.toHaveBeenCalled()
  })
})
