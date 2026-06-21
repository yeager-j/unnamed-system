import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  err,
  ok,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game/foundation"

import { endDungeonCombatAction } from "./end-dungeon-combat"

// Stub the DB/auth seams; the engine (pruneCombat / reduceDungeon) runs for real,
// and `guardMany` runs its body inline with a sentinel executor (real rollback is
// covered by guard-many.test.ts) so this asserts the orchestration: prune the
// shared Instance back to its exploration profile, end the encounter, and advance
// the dungeon turn — atomically.
const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadEncounterRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const setEncounterStatus = vi.fn()
const saveMapInstanceState = vi.fn()
const saveDungeonState = vi.fn()
const revalidateDungeon = vi.fn()
const publishEncounterPing = vi.fn()
const publishDungeonInstancePing = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadEncounterRowById: (id: string) => loadEncounterRowById(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
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
vi.mock("@/lib/db/writes/dungeon", () => ({
  saveDungeonState: (id: string, state: DungeonState, v: number, tx: unknown) =>
    saveDungeonState(id, state, v, tx),
}))
vi.mock("@/lib/db/writes/guard-many", () => ({
  guardMany: async (body: (tx: unknown) => unknown) => body("tx"),
}))
vi.mock("@/lib/actions/dungeon/revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, v: number) =>
    publishDungeonInstancePing(shortId, v),
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON = {
  id: "dungeon-1",
  shortId: "delve-1",
  campaignId: "campaign-1",
  mapInstanceId: "instance-1",
  name: "The Sunken Vault",
  status: "active" as const,
  state: {
    turnCounter: 5,
    actedCharacterIds: ["char-pc"],
    reminderSettings: {
      randomEncounters: { enabled: false, intervalTurns: 6 },
    },
  } satisfies DungeonState,
}

// A live encounter on the delve's own Instance: one PC (id === characterId), a
// catalog enemy, and a free-entry enemy. `char-pc2` is a party member who sat the
// fight out — present on the Instance but absent from the session.
const ENCOUNTER = {
  id: "enc-1",
  shortId: "enc-short",
  mapInstanceId: DUNGEON.mapInstanceId,
  status: "live" as const,
  session: {
    combatants: [
      {
        id: "char-pc",
        side: "players",
        ref: { kind: "pc", characterId: "char-pc" },
      },
      {
        id: "enemy-1",
        side: "enemies",
        ref: { kind: "catalog-enemy", enemyKey: "goblin" },
      },
      { id: "enemy-2", side: "enemies", ref: { kind: "enemy" } },
    ],
  },
}

function instanceState(): MapInstanceState {
  return {
    geometry: {
      zones: {
        "zone-a": {
          id: "zone-a",
          name: "Hall",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
        },
        "zone-b": {
          id: "zone-b",
          name: "Crypt",
          description: "",
          dmNotes: "",
          position: { x: 200, y: 0 },
        },
      },
      connections: {},
    },
    occupancy: {
      "char-pc": {
        zoneId: "zone-a",
        engagement: { status: "engaged", targetCombatantIds: ["enemy-1"] },
      },
      "char-pc2": { zoneId: "zone-b", engagement: { status: "free" } },
      "enemy-1": {
        zoneId: "zone-a",
        engagement: { status: "engaged", targetCombatantIds: ["char-pc"] },
      },
      "enemy-2": { zoneId: "zone-a", engagement: { status: "free" } },
    },
    reveal: {
      revealedZoneIds: ["zone-a"],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    enchantment: { zoneId: "zone-a", type: "toccata", forte: 2 },
  }
}

const VALID_INPUT = {
  encounterId: ENCOUNTER.id,
  dungeonId: DUNGEON.id,
  expectedEncounterVersion: 7,
  expectedInstanceVersion: 3,
  expectedDungeonVersion: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue(undefined)
  loadDungeonRowById.mockResolvedValue(DUNGEON)
  loadEncounterRowById.mockResolvedValue(ENCOUNTER)
  loadMapInstanceById.mockResolvedValue({ state: instanceState() })
  setEncounterStatus.mockResolvedValue(ok({ version: 8 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 4 }))
  saveDungeonState.mockResolvedValue(ok({ version: 2 }))
})

describe("endDungeonCombatAction", () => {
  it("prunes only the non-pc tokens, keeps every PC token, and advances the turn", async () => {
    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(ok({ version: 8 }))

    // The encounter is flipped to ended, guarded on its own version.
    expect(setEncounterStatus).toHaveBeenCalledWith("enc-1", "ended", 7, "tx")

    // Instance: the two enemy tokens are pruned; both PC tokens persist where they
    // stood (including the sat-out `char-pc2`, which was never in the session).
    const [, , nextInstance] = saveMapInstanceState.mock.calls[0]!
    const occupancy = (nextInstance as MapInstanceState).occupancy
    expect(Object.keys(occupancy).sort()).toEqual(["char-pc", "char-pc2"])
    expect(occupancy["char-pc"]!.zoneId).toBe("zone-a")
    expect(occupancy["char-pc2"]!.zoneId).toBe("zone-b")

    // Engagement + enchantment (combat-scoped) are cleared.
    expect(occupancy["char-pc"]!.engagement).toEqual({ status: "free" })
    expect((nextInstance as MapInstanceState).enchantment).toBeNull()

    // Dungeon: the consumed turn is advanced and acted flags reset.
    const [, nextDungeon] = saveDungeonState.mock.calls[0]!
    expect((nextDungeon as DungeonState).turnCounter).toBe(6)
    expect((nextDungeon as DungeonState).actedCharacterIds).toEqual([])

    expect(publishEncounterPing).toHaveBeenCalledWith("enc-short", {
      version: 8,
      status: "ended",
    })
    expect(publishDungeonInstancePing).toHaveBeenCalledWith(DUNGEON.shortId, 4)
    expect(publishDungeonPing).toHaveBeenCalledWith(DUNGEON.shortId, {
      version: 2,
      status: "active",
    })
    expect(revalidateDungeon).toHaveBeenCalledWith(DUNGEON)
  })

  it("rejects when the dungeon doesn't exist", async () => {
    loadDungeonRowById.mockResolvedValue(null)

    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(err("dungeon-not-found"))
    expect(requireCampaignDM).not.toHaveBeenCalled()
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("rejects when the encounter doesn't exist", async () => {
    loadEncounterRowById.mockResolvedValue(null)

    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(err("encounter-not-found"))
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("rejects when the encounter runs on a different Instance than this delve", async () => {
    loadEncounterRowById.mockResolvedValue({
      ...ENCOUNTER,
      mapInstanceId: "some-other-instance",
    })

    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(err("encounter-not-on-dungeon"))
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("rejects when the encounter is no longer live", async () => {
    loadEncounterRowById.mockResolvedValue({ ...ENCOUNTER, status: "ended" })

    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(err("encounter-not-live"))
    expect(setEncounterStatus).not.toHaveBeenCalled()
  })

  it("surfaces a stale Instance and rolls back (no dungeon write)", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))

    const result = await endDungeonCombatAction(VALID_INPUT)

    expect(result).toEqual(err("stale"))
    expect(saveDungeonState).not.toHaveBeenCalled()
    expect(publishEncounterPing).not.toHaveBeenCalled()
  })

  it("rejects invalid input", async () => {
    const result = await endDungeonCombatAction({
      encounterId: "",
      dungeonId: "",
      expectedEncounterVersion: -1,
    } as never)

    expect(result).toEqual(err("invalid-input"))
  })
})
