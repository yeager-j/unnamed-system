import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type OverlayComponents,
  type Session,
  type StoredEntityLocator,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/result"

import type { LoadedEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { addCatalogEnemiesAction } from "./add-participants"

// Same seam-stubbing shape as `apply-event.test.ts`: the DM gate, the
// campaignId lookup, the v2 write-path loader, and the guarded blob write are
// mocked; the pure reducer + fail-closed saver run for real. `instantiateEnemy`
// is stubbed at the composition seam — its materialization semantics (deep
// copy, fresh vitals) are the engine's own tests' concern.
const requireCampaignDM = vi.fn()
const loadEncounterCampaignId = vi.fn()
const loadEncounterForWrite = vi.fn()
const saveEncounterSession = vi.fn()
const revalidateEncounter = vi.fn()
const publishEncounterPing = vi.fn()
const instantiateEnemy = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterCampaignId: (id: string) => loadEncounterCampaignId(id),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForWrite: (id: string) => loadEncounterForWrite(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  saveEncounterSession: (id: string, stored: StoredSession, v: number) =>
    saveEncounterSession(id, stored, v),
}))
vi.mock("@/domain/game-engine-v2", () => ({
  instantiateEnemy: (key: string, id: string) => instantiateEnemy(key, id),
}))
vi.mock("../encounter/revalidate", () => ({
  revalidateEncounter: (encounter: { shortId: string }) =>
    revalidateEncounter(encounter),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
}))

const ENCOUNTER_ID = "encounter-1"
const CAMPAIGN_ID = "campaign-1"
const PC_ID = asParticipantId("c-pc")

function makeSession(): Session {
  return {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: [
      makeParticipant(
        { id: "char-1", components: { vitals: { base: 30, damage: 0 } } },
        PC_ID,
        { side: "players" }
      ),
    ],
  }
}

function makeLocators(): Map<ParticipantId, StoredEntityLocator> {
  return new Map<ParticipantId, StoredEntityLocator>([
    [PC_ID, { storage: "durable", entityId: "char-1" }],
  ])
}

function makeLoaded(): LoadedEncounterForWrite {
  return {
    row: {
      id: ENCOUNTER_ID,
      campaignId: CAMPAIGN_ID,
      shortId: "enc1",
      name: "Test",
      status: "draft",
      mapInstanceId: "mi-1",
      session: { round: 1 },
      version: 0,
    } as EncounterRow,
    loaded: {
      session: makeSession(),
      locators: makeLocators(),
    },
    durableVersions: new Map([["char-1", 3]]),
  }
}

/** A fresh goblin entity per call, mirroring the engine's per-copy mint. */
function stubGoblin(key: string, id: string): Entity | undefined {
  if (key !== "goblin") return undefined
  return { id, components: { vitals: { base: 16, damage: 0 } } }
}

beforeEach(() => {
  requireCampaignDM.mockReset().mockResolvedValue({ id: CAMPAIGN_ID })
  loadEncounterCampaignId.mockReset().mockResolvedValue(CAMPAIGN_ID)
  loadEncounterForWrite.mockReset().mockResolvedValue(ok(makeLoaded()))
  saveEncounterSession.mockReset().mockResolvedValue(ok({ version: 1 }))
  revalidateEncounter.mockReset()
  publishEncounterPing.mockReset()
  instantiateEnemy.mockReset().mockImplementation(stubGoblin)
})

function lastSavedBlob(): StoredSession {
  const calls = saveEncounterSession.mock.calls
  return calls[calls.length - 1]![1] as StoredSession
}

describe("addCatalogEnemiesAction", () => {
  it("appends count copies as unplaced inline enemies in one guarded save", async () => {
    const result = await addCatalogEnemiesAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      enemies: [{ enemyKey: "goblin", count: 2 }],
    })

    expect(result).toEqual(ok({ version: 1 }))
    expect(saveEncounterSession).toHaveBeenCalledTimes(1)

    const blob = lastSavedBlob()
    expect(blob.participants).toHaveLength(3)
    const goblins = blob.participants.filter((p) => p.id !== PC_ID)
    expect(goblins).toHaveLength(2)
    expect(new Set(goblins.map((g) => g.id)).size).toBe(2)
    for (const goblin of goblins) {
      expect(goblin.locator.storage).toBe("inline")
      const overlay = goblin.overlay as OverlayComponents
      expect(overlay.allegiance.side).toBe("enemies")
    }

    expect(publishEncounterPing).toHaveBeenCalledWith("enc1", {
      version: 1,
      status: "draft",
    })
    expect(revalidateEncounter).toHaveBeenCalled()
  })

  it("rejects an unknown catalog key before anything persists", async () => {
    const result = await addCatalogEnemiesAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      enemies: [
        { enemyKey: "goblin", count: 1 },
        { enemyKey: "not-a-monster", count: 1 },
      ],
    })

    expect(result).toEqual(err("unknown-enemy"))
    expect(saveEncounterSession).not.toHaveBeenCalled()
  })

  it("rejects a non-DM before the session loads", async () => {
    requireCampaignDM.mockRejectedValue(new Error("forbidden"))

    await expect(
      addCatalogEnemiesAction({
        encounterId: ENCOUNTER_ID,
        expectedVersion: 0,
        enemies: [{ enemyKey: "goblin", count: 1 }],
      })
    ).rejects.toThrow("forbidden")
    expect(loadEncounterForWrite).not.toHaveBeenCalled()
  })

  it("propagates a stale guarded write without pinging", async () => {
    saveEncounterSession.mockResolvedValue(err("stale"))

    const result = await addCatalogEnemiesAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      enemies: [{ enemyKey: "goblin", count: 1 }],
    })

    expect(result).toEqual(err("stale"))
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("rejects malformed input without touching the db", async () => {
    const result = await addCatalogEnemiesAction({
      encounterId: ENCOUNTER_ID,
      expectedVersion: 0,
      enemies: [],
    })
    expect(result).toEqual(err("invalid-input"))
    expect(loadEncounterCampaignId).not.toHaveBeenCalled()
  })
})
