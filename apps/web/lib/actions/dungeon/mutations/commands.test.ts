import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  createDungeonState,
  emptyMapInstance,
} from "@workspace/game-v2/spatial"
import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import {
  dungeonAxis,
  encounterAxis,
  mapInstanceAxis,
  regionAxis,
} from "@/lib/db/axes"
import type { DungeonRow } from "@/lib/db/schema/dungeon"

const loadDungeonRowById = vi.fn()
const loadCampaignRowById = vi.fn()
const lockDungeonRowForMutation = vi.fn()
const loadMapInstanceById = vi.fn()
const loadActiveDungeonForCampaign = vi.fn()
const loadLiveEncounterForMapInstance = vi.fn()
const loadLiveEncounterIdForCampaign = vi.fn()
const loadRegionRowById = vi.fn()
const saveDungeonState = vi.fn()
const setDungeonStatus = vi.fn()
const activateDungeonWithState = vi.fn()
const saveMapInstanceState = vi.fn()
const freezeMapInstance = vi.fn()
const foldRegionStaticReveal = vi.fn()
const createEncounter = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/queries/load-dungeon", () => ({
  loadDungeonRowById: (...args: unknown[]) => loadDungeonRowById(...args),
  loadActiveDungeonForCampaign: (...args: unknown[]) =>
    loadActiveDungeonForCampaign(...args),
}))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (...args: unknown[]) => loadCampaignRowById(...args),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (...args: unknown[]) => loadMapInstanceById(...args),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadLiveEncounterForMapInstance: (...args: unknown[]) =>
    loadLiveEncounterForMapInstance(...args),
  loadLiveEncounterIdForCampaign: (...args: unknown[]) =>
    loadLiveEncounterIdForCampaign(...args),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  loadRegionRowById: (...args: unknown[]) => loadRegionRowById(...args),
}))
vi.mock("@/lib/db/writes/dungeon", () => ({
  lockDungeonRowForMutation: (...args: unknown[]) =>
    lockDungeonRowForMutation(...args),
  saveDungeonState: (...args: unknown[]) => saveDungeonState(...args),
  setDungeonStatus: (...args: unknown[]) => setDungeonStatus(...args),
  activateDungeonWithState: (...args: unknown[]) =>
    activateDungeonWithState(...args),
}))
vi.mock("@/lib/db/writes/map-instance", () => ({
  saveMapInstanceState: (...args: unknown[]) => saveMapInstanceState(...args),
  freezeMapInstance: (...args: unknown[]) => freezeMapInstance(...args),
}))
vi.mock("@/lib/db/writes/region", () => ({
  foldRegionStaticReveal: (...args: unknown[]) =>
    foldRegionStaticReveal(...args),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  createEncounter: (...args: unknown[]) => createEncounter(...args),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishDungeonInstancePing: vi.fn(),
  publishDungeonPing: vi.fn(),
}))
vi.mock("../revalidate", () => ({ revalidateDungeon: vi.fn() }))

const { dungeonCommandHandler } = await import("./commands")

const actor = { userId: "dm-1", email: "dm@example.com" }
const tx = {} as Parameters<typeof dungeonCommandHandler.execute>[0]["tx"]
const baseDungeon = {
  id: "dungeon-1",
  shortId: "dng-1",
  campaignId: "campaign-1",
  mapInstanceId: "instance-1",
  regionId: null,
  status: "active",
  state: createDungeonState(),
  version: 3,
  deletedAt: null,
  name: "Delve",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies DungeonRow
const campaign = {
  id: baseDungeon.campaignId,
  shortId: "camp-1",
  dmUserId: actor.userId,
}
const instance = {
  id: baseDungeon.mapInstanceId,
  mapId: null,
  state: emptyMapInstance(),
  version: 5,
}

beforeEach(() => {
  vi.clearAllMocks()
  loadDungeonRowById.mockResolvedValue(baseDungeon)
  loadCampaignRowById.mockResolvedValue(campaign)
  lockDungeonRowForMutation.mockResolvedValue(ok(baseDungeon))
  loadMapInstanceById.mockResolvedValue(instance)
  loadActiveDungeonForCampaign.mockResolvedValue(null)
  loadLiveEncounterForMapInstance.mockResolvedValue(null)
  loadLiveEncounterIdForCampaign.mockResolvedValue(null)
  saveDungeonState.mockResolvedValue(ok({ version: 4 }))
  setDungeonStatus.mockResolvedValue(ok({ version: 4 }))
  activateDungeonWithState.mockResolvedValue(ok({ version: 4 }))
  saveMapInstanceState.mockResolvedValue(ok({ version: 6 }))
  freezeMapInstance.mockResolvedValue(ok({ version: 6 }))
  foldRegionStaticReveal.mockResolvedValue(ok({ version: 8 }))
  createEncounter.mockResolvedValue({ id: "encounter-1", shortId: "enc-1" })
})

describe("dungeon.command authority", () => {
  it("screens authorization before receipt ownership and rechecks it after locking", async () => {
    const args = {
      dungeonId: baseDungeon.id,
      command: { kind: "finish" as const },
    }
    loadCampaignRowById.mockResolvedValueOnce({
      ...campaign,
      dmUserId: "other",
    })

    await expect(
      dungeonCommandHandler.screen({ executor: tx, actor, args })
    ).resolves.toEqual({ kind: "denied" })
    expect(lockDungeonRowForMutation).not.toHaveBeenCalled()

    loadCampaignRowById.mockResolvedValue({ ...campaign, dmUserId: "other" })
    await expect(
      dungeonCommandHandler.admit({ tx, actor, args })
    ).resolves.toEqual({ kind: "denied" })
    expect(lockDungeonRowForMutation).toHaveBeenCalledWith(tx, baseDungeon.id)
  })

  it("search-and-reveal commits and stamps dungeon then map-instance", async () => {
    const stamp = createStampAccumulator()
    const args = {
      dungeonId: baseDungeon.id,
      command: {
        kind: "searchReveal" as const,
        characterId: "pc-1",
        event: { kind: "revealZone" as const, zoneId: "zone-1" },
      },
    }

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args,
      evidence: { dungeon: baseDungeon, campaign: campaign as never },
      stamp,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveDungeonState).toHaveBeenCalledWith(
      baseDungeon.id,
      expect.anything(),
      baseDungeon.version,
      tx
    )
    expect(saveMapInstanceState).toHaveBeenCalledWith(
      tx,
      instance.id,
      expect.anything(),
      instance.version
    )
    expect(stamp.accepted().revisions).toEqual({
      [dungeonAxis(baseDungeon.id)]: 4,
      [mapInstanceAxis(instance.id)]: 6,
    })
  })

  it("rolls a second-row race into contention without exposing a partial stamp", async () => {
    saveMapInstanceState.mockResolvedValue(err("stale"))
    const stamp = createStampAccumulator()
    const args = {
      dungeonId: baseDungeon.id,
      command: {
        kind: "searchReveal" as const,
        characterId: "pc-1",
        event: { kind: "revealZone" as const, zoneId: "zone-1" },
      },
    }

    await expect(
      dungeonCommandHandler.execute({
        tx,
        actor,
        args,
        evidence: { dungeon: baseDungeon, campaign: campaign as never },
        stamp,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("refuses generation events at the authority boundary", async () => {
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: {
        dungeonId: baseDungeon.id,
        command: {
          kind: "event",
          event: {
            kind: "advanceCursors",
            consumed: { exits: 1 },
          },
        },
      },
      evidence: { dungeon: baseDungeon, campaign: campaign as never },
      stamp,
    })

    expect(decision).toEqual({
      kind: "refused",
      error: "generation-event-not-supported",
    })
    expect(saveDungeonState).not.toHaveBeenCalled()
    expect(saveMapInstanceState).not.toHaveBeenCalled()
  })

  it("starts an encounter without a synthetic dungeon bump", async () => {
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: {
        dungeonId: baseDungeon.id,
        command: {
          kind: "startEncounter",
          name: "Ambush",
          advantage: "neutral",
          firstSide: "players",
          partyCharacterIds: [],
          enemies: [],
        },
      },
      evidence: { dungeon: baseDungeon, campaign: campaign as never },
      stamp,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveDungeonState).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(stamp.accepted().revisions).toEqual({
      [mapInstanceAxis(instance.id)]: 6,
      [encounterAxis("encounter-1")]: 0,
    })
  })

  it("refuses to finish an ordinary delve while combat is live", async () => {
    loadLiveEncounterForMapInstance.mockResolvedValue({ id: "encounter-1" })
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: { dungeonId: baseDungeon.id, command: { kind: "finish" } },
      evidence: { dungeon: baseDungeon, campaign: campaign as never },
      stamp,
    })

    expect(decision).toEqual({
      kind: "refused",
      error: "delve-has-live-encounter",
    })
    expect(loadLiveEncounterForMapInstance).toHaveBeenCalledWith(
      baseDungeon.mapInstanceId,
      tx
    )
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("finishes an expedition with exact dungeon, map-instance, and region stamps", async () => {
    const expedition = { ...baseDungeon, regionId: "region-1" }
    const region = {
      id: "region-1",
      shortId: "region-short",
      version: 7,
      seedMapId: "map-1",
      staticReveal: {},
    }
    loadRegionRowById.mockResolvedValue(region)
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: { dungeonId: expedition.id, command: { kind: "finish" } },
      evidence: { dungeon: expedition, campaign: campaign as never },
      stamp,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(stamp.accepted().revisions).toEqual({
      [dungeonAxis(expedition.id)]: 4,
      [mapInstanceAxis(instance.id)]: 6,
      [regionAxis(region.id)]: 8,
    })
  })
})
