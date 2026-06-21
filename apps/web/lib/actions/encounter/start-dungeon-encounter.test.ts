import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok, type MapInstanceState } from "@workspace/game/foundation"

import { startDungeonEncounterAction } from "./start-dungeon-encounter"

// Stub the DB/auth seams; the engine (createCombatSession / reduceCombatSession /
// addOccupant / isRosterFullyPlaced) runs for real, and `guardMany` runs its body
// inline with a sentinel executor (real rollback is covered by guard-many.test.ts)
// so this asserts the orchestration: build the live session, place enemy tokens
// on the delve's own Instance, and create the encounter — atomically.
const requireCampaignDM = vi.fn()
const loadDungeonRowById = vi.fn()
const loadLiveEncounterForCampaign = vi.fn()
const loadMapInstanceById = vi.fn()
const createEncounter = vi.fn()
const saveMapInstanceState = vi.fn()
const revalidateDungeon = vi.fn()
const publishEncounterPing = vi.fn()
const publishDungeonInstancePing = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireCampaignDM: (id: string) => requireCampaignDM(id),
}))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (id: string) => loadDungeonRowById(id),
}))
vi.mock("@/lib/db/queries/load-encounter", () => ({
  loadLiveEncounterForCampaign: (id: string) =>
    loadLiveEncounterForCampaign(id),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  createEncounter: (input: unknown, tx: unknown) => createEncounter(input, tx),
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
vi.mock("@/lib/actions/dungeon/revalidate", () => ({
  revalidateDungeon: (dungeon: { shortId: string }) =>
    revalidateDungeon(dungeon),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterPing: (shortId: string, ping: unknown) =>
    publishEncounterPing(shortId, ping),
  publishDungeonInstancePing: (shortId: string, v: number) =>
    publishDungeonInstancePing(shortId, v),
}))

const DUNGEON = {
  id: "dungeon-1",
  shortId: "delve-1",
  campaignId: "campaign-1",
  mapInstanceId: "instance-1",
  name: "The Sunken Vault",
  status: "active" as const,
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
      },
      connections: {},
    },
    occupancy: {
      "char-pc": { zoneId: "zone-a", engagement: { status: "free" } },
    },
    reveal: {
      revealedZoneIds: ["zone-a"],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    enchantment: null,
  }
}

const VALID_INPUT = {
  dungeonId: DUNGEON.id,
  expectedInstanceVersion: 3,
  name: "Vault — combat",
  advantage: "neutral" as const,
  firstSide: "players" as const,
  partyCharacterIds: ["char-pc"],
  enemies: [{ enemyKey: "goblin", zoneId: "zone-a", count: 2 }],
}

beforeEach(() => {
  vi.clearAllMocks()
  requireCampaignDM.mockResolvedValue(undefined)
  loadDungeonRowById.mockResolvedValue(DUNGEON)
  loadLiveEncounterForCampaign.mockResolvedValue(null)
  loadMapInstanceById.mockResolvedValue({ state: instanceState() })
  saveMapInstanceState.mockResolvedValue(ok({ version: 4 }))
  createEncounter.mockResolvedValue({ id: "enc-1", shortId: "enc-short" })
})

describe("startDungeonEncounterAction", () => {
  it("creates an already-live encounter on the delve's Instance with enemy tokens placed", async () => {
    const result = await startDungeonEncounterAction(VALID_INPUT)

    expect(result).toEqual(ok({ shortId: "enc-short" }))

    // The encounter is created live, referencing the dungeon's own Instance.
    expect(createEncounter).toHaveBeenCalledTimes(1)
    const [createInput] = createEncounter.mock.calls[0]!
    expect(createInput).toMatchObject({
      campaignId: DUNGEON.campaignId,
      mapInstanceId: DUNGEON.mapInstanceId,
      status: "live",
    })
    // Session: the PC (id === characterId) + the two count-expanded goblins, with
    // advantage/firstSide recorded by the startCombat reduce.
    expect(createInput.session.advantage).toBe("neutral")
    expect(createInput.session.firstSide).toBe("players")
    expect(createInput.session.combatants).toHaveLength(3)
    const pc = createInput.session.combatants.find(
      (c: { ref: { kind: string } }) => c.ref.kind === "pc"
    )
    expect(pc.id).toBe("char-pc")
    expect(
      createInput.session.combatants.filter(
        (c: { side: string }) => c.side === "enemies"
      )
    ).toHaveLength(2)

    // Instance: the PC token is untouched (one entry, keyed by characterId) and the
    // two enemy tokens are added — no duplicate PC token on the shared Instance.
    const [, , nextInstance] = saveMapInstanceState.mock.calls[0]!
    const occupancy = (nextInstance as MapInstanceState).occupancy
    const occupants = Object.keys(occupancy)
    expect(occupants).toHaveLength(3)
    expect(occupants).toContain("char-pc")
    expect(
      Object.values(occupancy).filter((token) => token.zoneId === "zone-a")
    ).toHaveLength(3)

    expect(publishEncounterPing).toHaveBeenCalledWith("enc-short", {
      version: 0,
      status: "live",
    })
    expect(publishDungeonInstancePing).toHaveBeenCalledWith(DUNGEON.shortId, 4)
  })

  it("rejects when the campaign already has a live encounter", async () => {
    loadLiveEncounterForCampaign.mockResolvedValue({ id: "other" })

    const result = await startDungeonEncounterAction(VALID_INPUT)

    expect(result).toEqual(err("campaign-already-has-live-encounter"))
    expect(createEncounter).not.toHaveBeenCalled()
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("rejects when the delve isn't active", async () => {
    loadDungeonRowById.mockResolvedValue({ ...DUNGEON, status: "draft" })

    const result = await startDungeonEncounterAction(VALID_INPUT)

    expect(result).toEqual(err("delve-not-active"))
    expect(createEncounter).not.toHaveBeenCalled()
  })

  it("rejects an enemy placed in a zone that doesn't exist", async () => {
    const result = await startDungeonEncounterAction({
      ...VALID_INPUT,
      enemies: [{ enemyKey: "goblin", zoneId: "zone-missing", count: 1 }],
    })

    expect(result).toEqual(err("encounter-has-unplaced-combatants"))
    expect(createEncounter).not.toHaveBeenCalled()
  })

  it("surfaces a stale Instance and does not create the encounter", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))

    const result = await startDungeonEncounterAction(VALID_INPUT)

    expect(result).toEqual(err("stale"))
    expect(createEncounter).not.toHaveBeenCalled()
  })

  it("rejects invalid input", async () => {
    const result = await startDungeonEncounterAction({
      dungeonId: "",
      expectedInstanceVersion: -1,
    } as never)

    expect(result).toEqual(err("invalid-input"))
  })
})
