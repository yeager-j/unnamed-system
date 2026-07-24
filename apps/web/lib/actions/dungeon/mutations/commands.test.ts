import { beforeEach, describe, expect, it, vi } from "vitest"

import { templateSetContentSchema } from "@workspace/game-v2/generation"
import {
  createDungeonState,
  reduceMapInstance as createReduceMapInstance,
  emptyMapInstance,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { makeGenerationState } from "@workspace/game-v2/spatial/__fixtures__/spatial"
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
const loadTemplateSetRowById = vi.fn()
const loadCampaignRowById = vi.fn()
const loadMapRowById = vi.fn()
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
const foldRegionKnowledge = vi.fn()
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
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapRowById: (...args: unknown[]) => loadMapRowById(...args),
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
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetRowById: (...args: unknown[]) =>
    loadTemplateSetRowById(...args),
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
  foldRegionKnowledge: (...args: unknown[]) => foldRegionKnowledge(...args),
}))
vi.mock("@/lib/db/writes/encounter", () => ({
  createEncounter: (...args: unknown[]) => createEncounter(...args),
}))
vi.mock("../revalidate", () => ({ revalidateDungeon: vi.fn() }))

const { dungeonCommandHandler } = await import("./commands")

const actor = { userId: "dm-1", email: "dm@example.com" }
const mutationId = "00000000-0000-4000-8000-000000000001"
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
  foldRegionKnowledge.mockResolvedValue(ok({ version: 8 }))
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
      mutationId,
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
        mutationId,
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
      mutationId,
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
      mutationId,
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
      mutationId,
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

  describe("expandStub / retractZone (UNN-642) — real engine, mocked persistence", () => {
    // A seed-deterministic fixture: one mintable "hall" template (universal
    // tag), a weight-0 "relic" only force-pick can reach, closureChance 0 so
    // the roll always mints. The roller is the REAL engine — the authority
    // test stays honest with zero engine mocks.
    const setContent = templateSetContentSchema.parse({
      templates: {
        hall: {
          key: "hall",
          tags: ["hub"],
          accepts: ["hub"],
          weight: 1,
          exits: [{ optional: false }, { optional: false }],
        },
        relic: {
          key: "relic",
          tags: ["hub"],
          accepts: ["hub"],
          weight: 0,
          unique: true,
        },
        shrine: {
          key: "shrine",
          tags: ["hub"],
          accepts: ["hub"],
          weight: 0,
          unique: true,
        },
      },
      closureChance: 0,
    })
    const region = {
      id: "region-1",
      shortId: "region-short",
      version: 7,
      seedMapId: "map-1",
      templateSetId: "set-1",
      discoveredSiteKeys: [],
      staticReveal: {},
    }
    const expeditionState = (): DungeonState => ({
      ...createDungeonState(),
      generation: {
        seed: "expedition-seed",
        streamCursors: {},
        declarations: [],
        mintedUniqueKeys: [],
        mints: {},
      },
    })
    const expedition = (): DungeonRow => ({
      ...baseDungeon,
      regionId: region.id,
      state: expeditionState(),
    })
    const expeditionInstanceState = (): MapInstanceState => ({
      ...emptyMapInstance(),
      geometry: {
        pages: { default: { id: "default", name: "Page 1" } },
        zones: {
          entry: {
            id: "entry",
            name: "Entry",
            description: "",
            dmNotes: "",
            position: { x: 0, y: 0 },
            pageId: "default",
            templateKey: "hall",
          },
        },
        connections: {},
      },
      generation: makeGenerationState({
        zones: { entry: { source: "authored" as const, depth: 0 } },
        stubs: {
          "stub-1": {
            id: "stub-1",
            zoneId: "entry",
            bearing: 0,
            anchor: { side: "e" as const, offset: 0.5 },
          },
        },
        startingZoneIds: ["entry"],
      }),
    })
    const expeditionInstance = () => ({
      ...instance,
      state: expeditionInstanceState(),
    })

    const execute = (command: unknown, dungeon: DungeonRow = expedition()) =>
      dungeonCommandHandler.execute({
        tx,
        actor,
        args: {
          dungeonId: dungeon.id,
          command: command as never,
        },
        evidence: { dungeon, campaign: campaign as never },
        stamp: createStampAccumulator(),
        mutationId,
      })

    beforeEach(() => {
      loadRegionRowById.mockResolvedValue(region)
      loadTemplateSetRowById.mockResolvedValue({
        id: region.templateSetId,
        content: setContent,
      })
      loadMapInstanceById.mockResolvedValue(expeditionInstance())
    })

    it("creates ordered declarations, resolves authored sites, and schedules selected sites during free pregeneration", async () => {
      const draft = { ...expedition(), status: "draft" as const }
      loadMapRowById.mockResolvedValue({
        id: region.seedMapId,
        geometry: {
          pages: { default: { id: "default", name: "Page 1" } },
          zones: {
            entry: {
              id: "entry",
              name: "Entry",
              description: "",
              dmNotes: "",
              position: { x: 0, y: 0 },
              pageId: "default",
              templateKey: "hall",
            },
            "authored-relic": {
              id: "authored-relic",
              name: "Relic",
              description: "",
              dmNotes: "",
              position: { x: 2000, y: 0 },
              pageId: "default",
              templateKey: "relic",
            },
          },
          connections: {},
        },
      })

      const decision = await execute(
        {
          kind: "start",
          placements: [{ characterId: "pc-1", zoneId: "entry" }],
          siteDeclarations: [
            { templateKey: "relic", minDepth: 0, urgency: "eventually" },
            { templateKey: "shrine", minDepth: 1, urgency: "session" },
          ],
        },
        draft
      )

      expect(decision).toEqual({ kind: "accepted" })
      const activated = activateDungeonWithState.mock
        .calls[0]![2] as DungeonState
      expect(activated.turnCounter).toBe(0)
      expect(
        activated.generation.declarations.map((item) => ({
          sequence: item.sequence,
          templateKey: item.templateKey,
          resolved: item.resolvedZoneId,
        }))
      ).toEqual([
        {
          sequence: 0,
          templateKey: "relic",
          resolved: "authored-relic",
        },
        {
          sequence: 1,
          templateKey: "shrine",
          resolved: expect.any(String),
        },
      ])
      expect(activated.generation.streamCursors.draws).toBe(2)
      expect(activated.generation.mintedUniqueKeys).toEqual(
        expect.arrayContaining(["relic", "shrine"])
      )

      const generatedInstance = saveMapInstanceState.mock
        .calls[0]![2] as MapInstanceState
      expect(
        Object.values(generatedInstance.geometry.zones).some(
          (zone) => zone.templateKey === "shrine"
        )
      ).toBe(true)
      expect(generatedInstance.occupancy["pc-1"]?.zoneId).toBe("entry")
    })

    it("expands a stub: mint folded through the real reducers, both rows guarded, both axes stamped", async () => {
      const stamp = createStampAccumulator()
      const decision = await dungeonCommandHandler.execute({
        tx,
        actor,
        args: {
          dungeonId: expedition().id,
          command: { kind: "expandStub", stubId: "stub-1" },
        },
        evidence: { dungeon: expedition(), campaign: campaign as never },
        stamp,
        mutationId,
      })

      expect(decision).toEqual({ kind: "accepted" })
      expect(saveDungeonState).toHaveBeenCalledWith(
        baseDungeon.id,
        expect.anything(),
        baseDungeon.version,
        tx
      )
      const savedDungeonState = saveDungeonState.mock
        .calls[0]![1] as ReturnType<typeof expeditionState>
      // The turn ticked (carve cost) and the acted set cleared.
      expect(savedDungeonState.turnCounter).toBe(1)
      expect(savedDungeonState.actedCharacterIds).toEqual([])
      // The ledger recorded the mint: record carries the consumed stub
      // (byte-identical restore payload) and advanced cursors.
      const mints = Object.values(savedDungeonState.generation.mints)
      expect(mints).toHaveLength(1)
      expect(mints[0]!.templateKey).toBe("hall")
      expect(mints[0]!.stub).toEqual({
        id: "stub-1",
        zoneId: "entry",
        bearing: 0,
        anchor: { side: "e", offset: 0.5 },
      })
      expect(
        savedDungeonState.generation.streamCursors["closure"]
      ).toBeGreaterThanOrEqual(1)

      const savedInstanceState = saveMapInstanceState.mock
        .calls[0]![2] as ReturnType<typeof expeditionInstanceState>
      expect(savedInstanceState.generation.stubs["stub-1"]).toBeUndefined()
      const mintedZones = Object.values(
        savedInstanceState.geometry.zones
      ).filter((zone) => zone.id !== "entry")
      expect(mintedZones).toHaveLength(1)
      expect(mintedZones[0]!.templateKey).toBe("hall")
      // Exit-id continuity: the minted connection took the stub's id.
      expect(savedInstanceState.geometry.connections["stub-1"]).toMatchObject({
        fromZoneId: "entry",
        toZoneId: mintedZones[0]!.id,
      })

      expect(stamp.accepted().revisions).toEqual({
        [dungeonAxis(baseDungeon.id)]: 4,
        [mapInstanceAxis(instance.id)]: 6,
      })
    })

    it("accepts a consumed-stub expand as a benign no-op: no writes, empty revisions (D8)", async () => {
      const stamp = createStampAccumulator()
      const decision = await dungeonCommandHandler.execute({
        tx,
        actor,
        args: {
          dungeonId: expedition().id,
          command: { kind: "expandStub", stubId: "already-consumed" },
        },
        evidence: { dungeon: expedition(), campaign: campaign as never },
        stamp,
        mutationId,
      })

      expect(decision).toEqual({ kind: "accepted" })
      expect(saveDungeonState).not.toHaveBeenCalled()
      expect(saveMapInstanceState).not.toHaveBeenCalled()
      expect(stamp.accepted().revisions).toEqual({})
    })

    it("refuses expand on a draft delve, an ordinary delve, and a missing set", async () => {
      await expect(
        execute(
          { kind: "expandStub", stubId: "stub-1" },
          { ...expedition(), status: "draft" }
        )
      ).resolves.toEqual({ kind: "refused", error: "delve-not-active" })

      await expect(
        execute(
          { kind: "expandStub", stubId: "stub-1" },
          { ...expedition(), regionId: null }
        )
      ).resolves.toEqual({ kind: "refused", error: "not-an-expedition" })

      loadTemplateSetRowById.mockResolvedValue(null)
      await expect(
        execute({ kind: "expandStub", stubId: "stub-1" })
      ).resolves.toEqual({ kind: "refused", error: "template-set-not-found" })
    })

    it("force-pick mints the named template through the identical path; a bogus key refuses", async () => {
      const decision = await execute({
        kind: "expandStub",
        stubId: "stub-1",
        forcedTemplateKey: "relic",
      })
      expect(decision).toEqual({ kind: "accepted" })
      const savedInstanceState = saveMapInstanceState.mock
        .calls[0]![2] as ReturnType<typeof expeditionInstanceState>
      const minted = Object.values(savedInstanceState.geometry.zones).find(
        (zone) => zone.id !== "entry"
      )!
      expect(minted.templateKey).toBe("relic")
      const savedDungeonState = saveDungeonState.mock
        .calls[0]![1] as ReturnType<typeof expeditionState>
      expect(
        Object.values(savedDungeonState.generation.mints)[0]!.templateKey
      ).toBe("relic")

      vi.clearAllMocks()
      loadMapInstanceById.mockResolvedValue(expeditionInstance())
      loadRegionRowById.mockResolvedValue(region)
      loadTemplateSetRowById.mockResolvedValue({
        id: region.templateSetId,
        content: setContent,
      })
      await expect(
        execute({
          kind: "expandStub",
          stubId: "stub-1",
          forcedTemplateKey: "nope",
        })
      ).resolves.toEqual({
        kind: "refused",
        error: "forced-template-not-mintable",
      })
      expect(saveDungeonState).not.toHaveBeenCalled()
    })

    it("queues a K=1 site declaration without touching the map instance", async () => {
      const decision = await execute({
        kind: "declareSite",
        templateKey: "relic",
        minDepth: 4,
      })

      expect(decision).toEqual({ kind: "accepted" })
      const saved = saveDungeonState.mock.calls[0]![1] as DungeonState
      expect(saved.generation.declarations).toEqual([
        expect.objectContaining({
          sequence: 0,
          templateKey: "relic",
          minDepth: 4,
          k: 1,
          secretIndex: 1,
          qualifyingCount: 0,
        }),
      ])
      expect(saved.generation.streamCursors.draws).toBe(1)
      expect(saveMapInstanceState).not.toHaveBeenCalled()
    })

    it("refuses duplicate queued sites and spent unique sites", async () => {
      const pending = expedition()
      pending.state.generation.declarations = [
        {
          id: "declaration-1",
          sequence: 0,
          templateKey: "relic",
          minDepth: 0,
          k: 1,
          secretIndex: 1,
          qualifyingCount: 0,
        },
      ]
      await expect(
        execute(
          { kind: "declareSite", templateKey: "relic", minDepth: 0 },
          pending
        )
      ).resolves.toEqual({
        kind: "refused",
        error: "site-already-pending",
      })

      const spent = expedition()
      spent.state.generation.mintedUniqueKeys = ["relic"]
      await expect(
        execute(
          { kind: "declareSite", templateKey: "relic", minDepth: 0 },
          spent
        )
      ).resolves.toEqual({
        kind: "refused",
        error: "site-already-placed",
      })
    })

    it("force-places a site on the exact stub and resolves its K=1 declaration", async () => {
      const decision = await execute({
        kind: "expandStub",
        stubId: "stub-1",
        forcePlaceTemplateKey: "relic",
      })

      expect(decision).toEqual({ kind: "accepted" })
      const savedDungeon = saveDungeonState.mock.calls[0]![1] as DungeonState
      const declaration = savedDungeon.generation.declarations[0]!
      expect(declaration).toMatchObject({
        templateKey: "relic",
        k: 1,
        secretIndex: 1,
        qualifyingCount: 1,
      })
      expect(declaration.resolvedZoneId).toBeDefined()
      expect(savedDungeon.turnCounter).toBe(1)

      const savedInstance = saveMapInstanceState.mock
        .calls[0]![2] as MapInstanceState
      const minted = Object.values(savedInstance.geometry.zones).find(
        (zone) => zone.id !== "entry"
      )
      expect(minted?.templateKey).toBe("relic")
    })

    it("rolls an expand second-row race into contention without a partial stamp", async () => {
      saveMapInstanceState.mockResolvedValue(err("stale"))
      const stamp = createStampAccumulator()
      await expect(
        dungeonCommandHandler.execute({
          tx,
          actor,
          args: {
            dungeonId: expedition().id,
            command: { kind: "expandStub", stubId: "stub-1" },
          },
          evidence: { dungeon: expedition(), campaign: campaign as never },
          stamp,
          mutationId,
        })
      ).rejects.toBeInstanceOf(MutationContentionError)
      expect(stamp.accepted().revisions).toEqual({})
    })

    /** Runs a real expand and returns the post-mint rows — the honest retract
     *  fixture (the same states the DB would hold). Re-arms every mock first,
     *  so it composes after earlier calls within one test. */
    async function mintedRows() {
      vi.clearAllMocks()
      loadRegionRowById.mockResolvedValue(region)
      loadTemplateSetRowById.mockResolvedValue({
        id: region.templateSetId,
        content: setContent,
      })
      loadLiveEncounterForMapInstance.mockResolvedValue(null)
      loadMapInstanceById.mockResolvedValue(expeditionInstance())
      saveDungeonState.mockResolvedValue(ok({ version: 4 }))
      saveMapInstanceState.mockResolvedValue(ok({ version: 6 }))
      const decision = await execute({ kind: "expandStub", stubId: "stub-1" })
      expect(decision).toEqual({ kind: "accepted" })
      const dungeonState = saveDungeonState.mock.calls[0]![1] as ReturnType<
        typeof expeditionState
      >
      const instanceState = saveMapInstanceState.mock
        .calls[0]![2] as ReturnType<typeof expeditionInstanceState>
      const zoneId = Object.keys(instanceState.geometry.zones).find(
        (id) => id !== "entry"
      )!
      vi.clearAllMocks()
      loadRegionRowById.mockResolvedValue(region)
      loadTemplateSetRowById.mockResolvedValue({
        id: region.templateSetId,
        content: setContent,
      })
      loadLiveEncounterForMapInstance.mockResolvedValue(null)
      saveDungeonState.mockResolvedValue(ok({ version: 5 }))
      saveMapInstanceState.mockResolvedValue(ok({ version: 7 }))
      loadMapInstanceById.mockResolvedValue({
        ...instance,
        state: instanceState,
      })
      return {
        dungeon: { ...expedition(), state: dungeonState, version: 4 },
        instanceState,
        zoneId,
      }
    }

    it("retracts a minted leaf: stub restored under its original id, record replayed away, both axes stamped", async () => {
      const rows = await mintedRows()
      const stamp = createStampAccumulator()
      const decision = await dungeonCommandHandler.execute({
        tx,
        actor,
        args: {
          dungeonId: rows.dungeon.id,
          command: { kind: "retractZone", zoneId: rows.zoneId },
        },
        evidence: { dungeon: rows.dungeon, campaign: campaign as never },
        stamp,
        mutationId,
      })

      expect(decision).toEqual({ kind: "accepted" })
      const savedDungeonState = saveDungeonState.mock
        .calls[0]![1] as ReturnType<typeof expeditionState>
      expect(savedDungeonState.generation.mints).toEqual({})
      // Cursors never rewind: the mint's consumption survives the revert.
      expect(
        savedDungeonState.generation.streamCursors["closure"]
      ).toBeGreaterThanOrEqual(1)
      // No turn refund — retract is the escape hatch, not play.
      expect(savedDungeonState.turnCounter).toBe(1)

      const savedInstanceState = saveMapInstanceState.mock
        .calls[0]![2] as ReturnType<typeof expeditionInstanceState>
      expect(savedInstanceState.geometry.zones[rows.zoneId]).toBeUndefined()
      expect(savedInstanceState.generation.stubs["stub-1"]).toEqual({
        id: "stub-1",
        zoneId: "entry",
        bearing: 0,
        anchor: { side: "e", offset: 0.5 },
      })

      expect(stamp.accepted().revisions).toEqual({
        [dungeonAxis(baseDungeon.id)]: 5,
        [mapInstanceAxis(instance.id)]: 7,
      })
    })

    it("accepts a retract of an absent zone as a benign no-op", async () => {
      const stamp = createStampAccumulator()
      const decision = await dungeonCommandHandler.execute({
        tx,
        actor,
        args: {
          dungeonId: expedition().id,
          command: { kind: "retractZone", zoneId: "never-existed" },
        },
        evidence: { dungeon: expedition(), campaign: campaign as never },
        stamp,
        mutationId,
      })
      expect(decision).toEqual({ kind: "accepted" })
      expect(saveDungeonState).not.toHaveBeenCalled()
      expect(saveMapInstanceState).not.toHaveBeenCalled()
      expect(stamp.accepted().revisions).toEqual({})
    })

    it("refuses each retract precondition with its own code", async () => {
      // Authored provenance.
      const authored = await execute({
        kind: "retractZone",
        zoneId: "entry",
      })
      expect(authored).toEqual({
        kind: "refused",
        error: "retract-zone-not-generated",
      })

      // Revealed.
      let rows = await mintedRows()
      loadMapInstanceById.mockResolvedValue({
        ...instance,
        state: {
          ...rows.instanceState,
          reveal: {
            ...rows.instanceState.reveal,
            revealedZoneIds: [rows.zoneId],
          },
        },
      })
      await expect(
        execute({ kind: "retractZone", zoneId: rows.zoneId }, rows.dungeon)
      ).resolves.toEqual({ kind: "refused", error: "retract-zone-revealed" })

      // Occupied.
      rows = await mintedRows()
      loadMapInstanceById.mockResolvedValue({
        ...instance,
        state: {
          ...rows.instanceState,
          occupancy: {
            "pc-1": {
              zoneId: rows.zoneId,
              engagement: { status: "free" as const },
            },
          },
        },
      })
      await expect(
        execute({ kind: "retractZone", zoneId: rows.zoneId }, rows.dungeon)
      ).resolves.toEqual({ kind: "refused", error: "retract-zone-occupied" })

      // Live encounter on the instance.
      rows = await mintedRows()
      loadLiveEncounterForMapInstance.mockResolvedValue({ id: "encounter-1" })
      await expect(
        execute({ kind: "retractZone", zoneId: rows.zoneId }, rows.dungeon)
      ).resolves.toEqual({
        kind: "refused",
        error: "retract-zone-in-encounter",
      })

      // Non-leaf: a child stub was consumed (dead-ended) after the mint.
      rows = await mintedRows()
      const childStubId = Object.values(
        rows.instanceState.generation.stubs
      ).find((stub) => stub.zoneId === rows.zoneId)!.id
      loadMapInstanceById.mockResolvedValue({
        ...instance,
        state: createReduceMapInstance(() => "unused")(rows.instanceState, {
          kind: "resolveDeadEnd",
          stubId: childStubId,
        }),
      })
      await expect(
        execute({ kind: "retractZone", zoneId: rows.zoneId }, rows.dungeon)
      ).resolves.toEqual({ kind: "refused", error: "retract-zone-not-leaf" })
    })
  })

  it("finishes an expedition with exact dungeon, map-instance, and region stamps", async () => {
    const expedition = { ...baseDungeon, regionId: "region-1" }
    const region = {
      id: "region-1",
      shortId: "region-short",
      version: 7,
      seedMapId: "map-1",
      templateSetId: "set-1",
      discoveredSiteKeys: ["known-site"],
      staticReveal: {},
    }
    loadRegionRowById.mockResolvedValue(region)
    loadTemplateSetRowById.mockResolvedValue({
      content: templateSetContentSchema.parse({}),
    })
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: { dungeonId: expedition.id, command: { kind: "finish" } },
      evidence: { dungeon: expedition, campaign: campaign as never },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(stamp.accepted().revisions).toEqual({
      [dungeonAxis(expedition.id)]: 4,
      [mapInstanceAxis(instance.id)]: 6,
      [regionAxis(region.id)]: 8,
    })
    expect(foldRegionKnowledge).toHaveBeenCalledWith(tx, region.id, 7, {
      discoveredSiteKeys: ["known-site"],
      staticReveal: {},
    })
  })

  it("refuses expedition finish when its Template Set is unavailable", async () => {
    const expedition = { ...baseDungeon, regionId: "region-1" }
    loadRegionRowById.mockResolvedValue({
      id: "region-1",
      version: 7,
      seedMapId: "map-1",
      templateSetId: "missing-set",
      discoveredSiteKeys: [],
      staticReveal: {},
    })
    loadTemplateSetRowById.mockResolvedValue(null)
    const stamp = createStampAccumulator()

    const decision = await dungeonCommandHandler.execute({
      tx,
      actor,
      args: { dungeonId: expedition.id, command: { kind: "finish" } },
      evidence: { dungeon: expedition, campaign: campaign as never },
      stamp,
      mutationId,
    })

    expect(decision).toEqual({
      kind: "refused",
      error: "template-set-not-found",
    })
    expect(foldRegionKnowledge).not.toHaveBeenCalled()
    expect(setDungeonStatus).not.toHaveBeenCalled()
    expect(stamp.accepted().revisions).toEqual({})
  })
})
