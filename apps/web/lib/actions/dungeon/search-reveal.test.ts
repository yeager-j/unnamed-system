import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDungeonState,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { err, ok } from "@workspace/game/foundation"

import { searchRevealAction } from "./search-reveal"

// Stub the seams; the reducers run for real and `guardMany` runs its body inline
// (the real rollback is in guard-many.test.ts), so this asserts the
// search-that-reveals orchestration: markActed + reveal composed atomically.
const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadMapInstanceById = vi.fn()
const saveDungeonState = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateDungeon = vi.fn()
const publishDungeonPing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  saveDungeonState: (id: string, state: DungeonState, v: number, tx: unknown) =>
    saveDungeonState(id, state, v, tx),
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
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonPing: (shortId: string, ping: unknown) =>
    publishDungeonPing(shortId, ping),
}))

const DUNGEON_ID = "dungeon-1"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "mi-1"

function dungeonRow(state: DungeonState = createDungeonState()) {
  return {
    id: DUNGEON_ID,
    campaignId: CAMPAIGN_ID,
    mapInstanceId: MAP_INSTANCE_ID,
    shortId: "dng-short",
    status: "active" as const,
    state,
    version: 0,
  }
}

function instanceRow() {
  return {
    id: MAP_INSTANCE_ID,
    mapId: null,
    state: {
      geometry: {
        zones: {},
        connections: {
          c1: {
            id: "c1",
            fromZoneId: "z1",
            toZoneId: "z2",
            hidden: true,
            locked: false,
          },
        },
      },
      occupancy: {},
      enchantment: null,
      reveal: {
        revealedZoneIds: [],
        revealedConnectionIds: [],
        unlockedConnectionIds: [],
      },
    } satisfies MapInstanceState,
    version: 0,
  }
}

const searchInput = {
  dungeonId: DUNGEON_ID,
  expectedVersion: 0,
  expectedInstanceVersion: 0,
  characterId: "char-1",
  event: { kind: "revealConnection" as const, connectionId: "c1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonRowById.mockResolvedValue(dungeonRow())
  loadMapInstanceById.mockResolvedValue(instanceRow())
  requireCampaignDM.mockResolvedValue({ id: CAMPAIGN_ID })
  saveDungeonState.mockResolvedValue(ok({ version: 1 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 5 }))
})

describe("searchRevealAction", () => {
  it("rejects a non-reveal event (a move is never a search)", async () => {
    const result = await searchRevealAction({
      ...searchInput,
      event: {
        kind: "moveCombatant",
        combatantId: "char-1",
        toZoneId: "z2",
      } as never,
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(loadDungeonRowById).not.toHaveBeenCalled()
  })

  it("marks the searcher acted and reveals the connection atomically, returning both versions", async () => {
    const result = await searchRevealAction(searchInput)

    expect(result).toEqual({
      ok: true,
      value: { version: 1, instanceVersion: 5 },
    })

    const [, dungeonState] = saveDungeonState.mock.calls[0]!
    expect((dungeonState as DungeonState).actedCharacterIds).toEqual(["char-1"])

    const [, , instanceState] = saveMapInstanceState.mock.calls[0]!
    expect(
      (instanceState as MapInstanceState).reveal.revealedConnectionIds
    ).toEqual(["c1"])

    expect(revalidateDungeon).toHaveBeenCalled()
    // The cross-write bumps the dungeon row → a dungeon ping triggers the
    // fog-view refetch that carries the reveal (UNN-468).
    expect(publishDungeonPing).toHaveBeenCalledOnce()
  })

  it("surfaces a guard failure and does not revalidate (atomic — neither row commits)", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))

    const result = await searchRevealAction(searchInput)

    expect(result).toEqual({ ok: false, error: "stale" })
    expect(revalidateDungeon).not.toHaveBeenCalled()
  })
})
