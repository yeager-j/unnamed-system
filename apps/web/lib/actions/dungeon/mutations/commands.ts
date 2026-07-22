import "server-only"

import { revalidatePath } from "next/cache"

import {
  comintMapInstance,
  createReduceSession,
  isRosterFullyPlaced,
  saveSession,
  type ParticipantSetup,
  type StoredEntityLocator,
} from "@workspace/game-v2/encounter"
import {
  applyStaticReveal,
  foldExpedition,
  seedMintedUniqueKeys,
  sproutStartStubs,
  withAuthoredProvenance,
} from "@workspace/game-v2/generation"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  reduceMapInstance as createReduceMapInstance,
  mapInstanceFromGeometry,
  reduceDungeon,
  type GenerationLedger,
} from "@workspace/game-v2/spatial"
import { revisionAt, type StampAccumulator } from "@workspace/headcanon"
import {
  throwMutationContention,
  type DrizzleMutationTx,
} from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  allowMutationScreening,
  denyMutation,
  refuseMutation,
  type MutationCommand,
  type MutationCommandDecision,
} from "@workspace/headcanon/next/server"

import {
  dungeonCommand,
  isDungeonEvent,
  isGenerationDungeonCommandEvent,
  type DungeonCommandArgs,
  type DungeonCommandRefusal,
} from "@/domain/dungeon/commit/protocol"
import { createSession, instantiateEnemy } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import {
  dungeonAxis,
  encounterAxis,
  mapInstanceAxis,
  regionAxis,
} from "@/lib/db/axes"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import {
  loadActiveDungeonForCampaign,
  loadDungeonRowById,
} from "@/lib/db/queries/load-dungeon"
import {
  loadLiveEncounterForMapInstance,
  loadLiveEncounterIdForCampaign,
} from "@/lib/db/queries/load-encounter-session"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import {
  activateDungeonWithState,
  lockDungeonRowForMutation,
  saveDungeonState,
  setDungeonStatus,
} from "@/lib/db/writes/dungeon"
import { createEncounter } from "@/lib/db/writes/encounter"
import {
  freezeMapInstance,
  saveMapInstanceState,
} from "@/lib/db/writes/map-instance"
import { foldRegionStaticReveal } from "@/lib/db/writes/region"
import { campaignRegionPath } from "@/lib/paths"
import {
  publishDungeonInstancePing,
  publishDungeonPing,
} from "@/lib/realtime/publish"

import { placeRoster } from "../place-roster"
import { revalidateDungeon } from "../revalidate"

type DungeonMutationTx = DrizzleMutationTx<ReturnType<typeof getDb>>
type DungeonMutationPreflight = ReturnType<typeof getDb>
type DungeonMutationCommand<Projection, Evidence> = MutationCommand<
  typeof dungeonCommand,
  Actor,
  DungeonMutationPreflight,
  DungeonMutationTx,
  Projection,
  Evidence
>

interface DungeonProjection {
  readonly dungeonId: string
  readonly dungeonShortId: string
  readonly mapInstanceId: string
  readonly campaignShortId: string
  readonly regionShortId: string | null
}

interface AdmittedDungeonCommand {
  readonly dungeon: DungeonRow
  readonly campaign: CampaignRow
}

async function screenDungeonCommand(
  executor: WriteExecutor,
  actor: Actor,
  args: DungeonCommandArgs
) {
  const dungeon = await loadDungeonRowById(args.dungeonId, executor)
  if (!dungeon) return denyMutation()
  const campaign = await loadCampaignRowById(dungeon.campaignId, executor)
  if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
  const region = dungeon.regionId
    ? await loadRegionRowById(dungeon.regionId, executor)
    : null
  return allowMutationScreening<DungeonProjection>(
    Object.freeze({
      dungeonId: dungeon.id,
      dungeonShortId: dungeon.shortId,
      mapInstanceId: dungeon.mapInstanceId,
      campaignShortId: campaign.shortId,
      regionShortId: region?.shortId ?? null,
    })
  )
}

async function admitDungeonCommand(
  tx: WriteExecutor,
  actor: Actor,
  args: DungeonCommandArgs
) {
  const locked = await lockDungeonRowForMutation(tx, args.dungeonId)
  if (!locked.ok) return denyMutation()
  const campaign = await loadCampaignRowById(locked.value.campaignId, tx)
  if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
  return allowMutation<AdmittedDungeonCommand>({
    dungeon: locked.value,
    campaign,
  })
}

function requireStored(result: { readonly ok: boolean }): void {
  if (!result.ok) throwMutationContention()
}

const newId = () => crypto.randomUUID()

async function executeEvent(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  if (args.command.kind !== "event") throw new Error("event command expected")
  const event = args.command.event
  if (isGenerationDungeonCommandEvent(event)) {
    return refuseMutation("generation-event-not-supported")
  }

  if (isDungeonEvent(event)) {
    const saved = await saveDungeonState(
      dungeon.id,
      reduceDungeon(dungeon.state, event),
      dungeon.version,
      tx
    )
    requireStored(saved)
    if (!saved.ok) throwMutationContention()
    stamp.record(dungeonAxis(dungeon.id), saved.value.version)
    return acceptMutation()
  }

  if (event.kind === "placeCombatant") {
    const pc = await loadPlayerCharacterById(event.tokenKey, tx)
    if (
      !pc ||
      pc.entity.deletedAt !== null ||
      pc.status !== "finalized" ||
      pc.campaignId !== dungeon.campaignId
    ) {
      return refuseMutation("character-not-in-campaign")
    }
  }

  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")
  const saved = await saveMapInstanceState(
    tx,
    instance.id,
    createReduceMapInstance(newId)(instance.state, event),
    instance.version
  )
  requireStored(saved)
  if (!saved.ok) throwMutationContention()
  stamp.record(mapInstanceAxis(instance.id), saved.value.version)
  return acceptMutation()
}

async function executeSearchReveal(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (args.command.kind !== "searchReveal") {
    throw new Error("search reveal command expected")
  }
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")

  const savedDungeon = await saveDungeonState(
    dungeon.id,
    reduceDungeon(dungeon.state, {
      kind: "markActed",
      characterId: args.command.characterId,
    }),
    dungeon.version,
    tx
  )
  requireStored(savedDungeon)
  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    createReduceMapInstance(newId)(instance.state, args.command.event),
    instance.version
  )
  requireStored(savedInstance)
  if (!savedDungeon.ok || !savedInstance.ok) throwMutationContention()

  stamp.record(dungeonAxis(dungeon.id), savedDungeon.value.version)
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
  return acceptMutation()
}

async function executeStart(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (args.command.kind !== "start") throw new Error("start command expected")
  if (dungeon.status !== "draft") return refuseMutation("delve-not-draft")
  const active = await loadActiveDungeonForCampaign(dungeon.campaignId, tx)
  if (active && active.id !== dungeon.id) {
    return refuseMutation("campaign-already-has-active-delve")
  }
  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")

  let nextInstance
  let nextDungeonState = dungeon.state
  if (dungeon.regionId === null) {
    if (!instance.mapId) return refuseMutation("map-not-found")
    const map = await loadMapRowById(instance.mapId, tx)
    if (!map) return refuseMutation("map-not-found")
    nextInstance = placeRoster(
      mapInstanceFromGeometry(map.geometry),
      args.command.placements
    )
  } else {
    const live = await loadLiveEncounterForMapInstance(instance.id, tx)
    if (live) return refuseMutation("delve-has-live-encounter")
    const region = await loadRegionRowById(dungeon.regionId, tx)
    if (!region) return refuseMutation("region-not-found")
    const map = await loadMapRowById(region.seedMapId, tx)
    if (!map) return refuseMutation("map-not-found")
    const set = await loadTemplateSetRowById(region.templateSetId, tx)
    if (!set) return refuseMutation("template-set-not-found")
    const seed = newId()
    const snapshot = applyStaticReveal(
      withAuthoredProvenance(
        mapInstanceFromGeometry(map.geometry),
        args.command.placements.map((placement) => placement.zoneId)
      ),
      region.seedMapId,
      region.staticReveal
    )
    const { stubs, cursors } = sproutStartStubs({
      state: snapshot,
      set: set.content,
      startingZoneIds: args.command.placements.map(
        (placement) => placement.zoneId
      ),
      seed,
      newId,
    })
    nextInstance = placeRoster(
      { ...snapshot, generation: { ...snapshot.generation, stubs } },
      args.command.placements
    )
    const ledger: GenerationLedger = {
      seed,
      streamCursors: cursors,
      declarations: [],
      mintedUniqueKeys: seedMintedUniqueKeys(snapshot.geometry, set.content),
      mints: {},
    }
    nextDungeonState = { ...dungeon.state, generation: ledger }
  }

  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    nextInstance,
    instance.version
  )
  requireStored(savedInstance)
  const activated =
    dungeon.regionId === null
      ? await setDungeonStatus(dungeon.id, "active", dungeon.version, tx)
      : await activateDungeonWithState(
          tx,
          dungeon.id,
          nextDungeonState,
          dungeon.version
        )
  requireStored(activated)
  if (!savedInstance.ok || !activated.ok) throwMutationContention()
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
  stamp.record(dungeonAxis(dungeon.id), activated.value.version)
  return acceptMutation()
}

async function executeFinish(
  tx: WriteExecutor,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  if (dungeon.regionId === null) {
    const live = await loadLiveEncounterForMapInstance(
      dungeon.mapInstanceId,
      tx
    )
    if (live) return refuseMutation("delve-has-live-encounter")
    const saved = await setDungeonStatus(
      dungeon.id,
      "done",
      dungeon.version,
      tx
    )
    requireStored(saved)
    if (!saved.ok) throwMutationContention()
    stamp.record(dungeonAxis(dungeon.id), saved.value.version)
    return acceptMutation()
  }

  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")
  const frozen = await freezeMapInstance(tx, instance.id, instance.version)
  requireStored(frozen)
  const live = await loadLiveEncounterForMapInstance(instance.id, tx)
  if (live) return refuseMutation("delve-has-live-encounter")
  const region = await loadRegionRowById(dungeon.regionId, tx)
  if (!region) return refuseMutation("region-not-found")
  const folded = foldExpedition({
    instance: instance.state,
    seedMapId: region.seedMapId,
    prior: region.staticReveal,
  })
  const savedRegion = await foldRegionStaticReveal(
    tx,
    region.id,
    region.version,
    folded
  )
  requireStored(savedRegion)
  const savedDungeon = await setDungeonStatus(
    dungeon.id,
    "done",
    dungeon.version,
    tx
  )
  requireStored(savedDungeon)
  if (!frozen.ok || !savedRegion.ok || !savedDungeon.ok) {
    throwMutationContention()
  }
  stamp.record(mapInstanceAxis(instance.id), frozen.value.version)
  stamp.record(regionAxis(region.id), savedRegion.value.version)
  stamp.record(dungeonAxis(dungeon.id), savedDungeon.value.version)
  return acceptMutation()
}

async function executeStartEncounter(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (args.command.kind !== "startEncounter") {
    throw new Error("start encounter command expected")
  }
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  const live = await loadLiveEncounterIdForCampaign(dungeon.campaignId, tx)
  if (live) return refuseMutation("campaign-already-has-live-encounter")
  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")

  const setups: ParticipantSetup[] = []
  const locators = new Map<ParticipantId, StoredEntityLocator>()
  for (const characterId of args.command.partyCharacterIds) {
    const pc = await loadPlayerCharacterById(characterId, tx)
    if (
      !pc ||
      pc.entity.deletedAt !== null ||
      pc.status !== "finalized" ||
      pc.campaignId !== dungeon.campaignId
    ) {
      return refuseMutation("character-not-found")
    }
    const loaded = loadEntityRow(pc.entity)
    if (!loaded.ok) return refuseMutation("character-not-found")
    const participantId = asParticipantId(characterId)
    setups.push({
      id: participantId,
      side: "players",
      source: { entity: loaded.value },
    })
    locators.set(participantId, { storage: "durable", entityId: characterId })
  }

  const placement: Record<ParticipantId, string> = {}
  for (const { enemyKey, zoneId, count } of args.command.enemies) {
    for (let copy = 0; copy < count; copy += 1) {
      const participantId = asParticipantId(newId())
      const entity = instantiateEnemy(enemyKey, participantId)
      if (!entity) return refuseMutation("unknown-enemy")
      setups.push({
        id: participantId,
        side: "enemies",
        source: { entity },
      })
      locators.set(participantId, {
        storage: "inline",
        entity: { id: entity.id, components: entity.components },
      })
      placement[participantId] = zoneId
    }
  }

  const session = createReduceSession(newId)(createSession(setups, newId), {
    kind: "startCombat",
    advantage: args.command.advantage,
    firstSide: args.command.firstSide,
  })
  const nextInstance = comintMapInstance(session, placement, instance.state)
  if (!isRosterFullyPlaced(session, nextInstance)) {
    return refuseMutation("encounter-has-unplaced-combatants")
  }
  const stored = saveSession(session, locators)
  if (!stored.ok) return refuseMutation("locator-missing")

  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    nextInstance,
    instance.version
  )
  requireStored(savedInstance)
  const created = await createEncounter(
    {
      campaignId: dungeon.campaignId,
      name: args.command.name,
      session: stored.value,
      mapInstanceId: instance.id,
      status: "live",
    },
    tx
  )
  if (!savedInstance.ok) throwMutationContention()
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
  stamp.record(encounterAxis(created.id), 0)
  return acceptMutation()
}

export const dungeonCommandHandler = {
  screen: ({ executor, actor, args }) =>
    screenDungeonCommand(executor, actor, args),
  admit: ({ tx, actor, args }) => admitDungeonCommand(tx, actor, args),
  execute({ tx, args, evidence, stamp }) {
    switch (args.command.kind) {
      case "event":
        return executeEvent(tx, args, evidence.dungeon, stamp)
      case "searchReveal":
        return executeSearchReveal(tx, args, evidence.dungeon, stamp)
      case "start":
        return executeStart(tx, args, evidence.dungeon, stamp)
      case "finish":
        return executeFinish(tx, evidence.dungeon, stamp)
      case "startEncounter":
        return executeStartEncounter(tx, args, evidence.dungeon, stamp)
    }
  },
  finalizeAccepted({ args, stamp, projection }) {
    const dungeonVersion = revisionAt(
      stamp.revisions,
      dungeonAxis(projection.dungeonId)
    )
    if (dungeonVersion !== undefined) {
      publishDungeonPing(projection.dungeonShortId, {
        version: dungeonVersion,
        status:
          args.command.kind === "start"
            ? "active"
            : args.command.kind === "finish"
              ? "done"
              : "active",
      })
    }
    const instanceVersion = revisionAt(
      stamp.revisions,
      mapInstanceAxis(projection.mapInstanceId)
    )
    if (
      instanceVersion !== undefined &&
      ["event", "searchReveal", "start", "finish", "startEncounter"].includes(
        args.command.kind
      )
    ) {
      publishDungeonInstancePing(projection.dungeonShortId, instanceVersion)
    }
    revalidateDungeon({ shortId: projection.dungeonShortId })
    if (args.command.kind === "start" || args.command.kind === "finish") {
      revalidatePath(`/campaigns/${projection.campaignShortId}`)
    }
    if (args.command.kind === "finish" && projection.regionShortId !== null) {
      revalidatePath(
        campaignRegionPath(projection.campaignShortId, projection.regionShortId)
      )
    }
  },
} satisfies DungeonMutationCommand<DungeonProjection, AdmittedDungeonCommand>
