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
  buildRetraction,
  DEFAULT_PREGEN_ZONE_TARGET,
  foldExpedition,
  pregenerateExpedition,
  rollExpansion,
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
import type { StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  allowMutationScreening,
  denyMutation,
  refuseMutation,
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
import type { ShowtimeMutationCommand } from "@/lib/actions/mutations/environment"
import type { Actor } from "@/lib/auth/actor"
import {
  dungeonAxis,
  encounterAxis,
  mapInstanceAxis,
  regionAxis,
} from "@/lib/db/axes"
import type { WriteExecutor } from "@/lib/db/client"
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

import { placeRoster } from "../place-roster"
import { revalidateDungeon } from "../revalidate"

type DungeonMutationCommand<Projection, Evidence> = ShowtimeMutationCommand<
  typeof dungeonCommand,
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
    // startingZoneIds persist on the instance (UNN-642): the edge growth
    // mode's half-plane needs them at every expansion, and the placements
    // they derive from are transient to this command. Deduped + sorted for a
    // deterministic blob; the Set-based bearing math is duplicate-insensitive.
    const startingZoneIds = [
      ...new Set(args.command.placements.map((placement) => placement.zoneId)),
    ].sort()
    const ledger: GenerationLedger = {
      seed,
      streamCursors: cursors,
      declarations: [],
      mintedUniqueKeys: seedMintedUniqueKeys(snapshot.geometry, set.content),
      mints: {},
    }
    // Pre-generate the whole map up front (UNN-642 "replace" experience): the
    // pure roller carves to a target size and seals the frontier, so the
    // expedition begins with a complete board the DM can review and the party
    // reveals as it explores — no per-room click, no per-carve turn cost.
    const pregen = pregenerateExpedition({
      set: set.content,
      instanceState: {
        ...snapshot,
        generation: { ...snapshot.generation, stubs, startingZoneIds },
      },
      ledger,
      zoneTarget: DEFAULT_PREGEN_ZONE_TARGET,
      newId,
    })
    nextInstance = placeRoster(pregen.instanceState, args.command.placements)
    nextDungeonState = { ...dungeon.state, generation: pregen.ledger }
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

/**
 * The expand gesture (UNN-642, D1/D8): the one non-optimistic spatial write.
 * The pure roller resolves mint / closure / dead end server-side against the
 * ledger; this executor is the thin impure shell — load, roll, fold through
 * the shared reducers, persist both rows version-guarded, stamp both axes.
 */
async function executeExpandStub(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (args.command.kind !== "expandStub") {
    throw new Error("expand stub command expected")
  }
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  // Variant sealing (D11): generation exists only on Region expeditions.
  if (dungeon.regionId === null) return refuseMutation("not-an-expedition")
  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")

  // The D8 retry contract's benign no-op: a NEW mutation aimed at a consumed
  // stub (double-click race, a second console, a committed-but-response-lost
  // retry under a fresh mutationId) accepts with no writes and an empty
  // revision vector — never an error toast. Same-mutationId retries never
  // reach here (receipt dedup replays the recorded outcome), and the engine
  // reducers mirror this no-op as defense in depth.
  if (instance.state.generation.stubs[args.command.stubId] === undefined) {
    return acceptMutation()
  }

  const region = await loadRegionRowById(dungeon.regionId, tx)
  if (!region) return refuseMutation("region-not-found")
  const set = await loadTemplateSetRowById(region.templateSetId, tx)
  if (!set) return refuseMutation("template-set-not-found")

  const rolled = rollExpansion(
    {
      set: set.content,
      instanceState: instance.state,
      ledger: dungeon.state.generation,
      stubId: args.command.stubId,
      newId,
    },
    args.command.forcedTemplateKey === undefined
      ? undefined
      : { forcedTemplateKey: args.command.forcedTemplateKey }
  )
  if (!rolled.ok) {
    // The stub was screened present above, so the context arms indicate
    // corrupt state; everything else is a forced-pick refusal.
    return refuseMutation(
      rolled.error === "unknown-stub" || rolled.error === "unknown-parent-zone"
        ? "expansion-failed"
        : "forced-template-not-mintable"
    )
  }

  const savedDungeon = await saveDungeonState(
    dungeon.id,
    rolled.value.dungeonEvents.reduce(reduceDungeon, dungeon.state),
    dungeon.version,
    tx
  )
  requireStored(savedDungeon)
  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    rolled.value.instanceEvents.reduce(
      createReduceMapInstance(newId),
      instance.state
    ),
    instance.version
  )
  requireStored(savedInstance)
  if (!savedDungeon.ok || !savedInstance.ok) throwMutationContention()
  stamp.record(dungeonAxis(dungeon.id), savedDungeon.value.version)
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
  return acceptMutation()
}

/**
 * Retract (UNN-642, D4/D8): the DM's escape hatch, context-menu-only. The
 * engine's `buildRetraction` owns every instance-state precondition (generated
 * provenance, mint record, unrevealed, unoccupied, strict leaf) and the
 * byte-identical restored stub; this executor adds the two DB facts — status
 * active and no live encounter on the instance. No turn cost.
 */
async function executeRetractZone(
  tx: WriteExecutor,
  args: DungeonCommandArgs,
  dungeon: DungeonRow,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<DungeonCommandRefusal>> {
  if (args.command.kind !== "retractZone") {
    throw new Error("retract zone command expected")
  }
  if (dungeon.status !== "active") return refuseMutation("delve-not-active")
  const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")

  // Benign no-op: the zone is already gone (a lost-response retry under a
  // fresh mutationId found its work done) — accept with no writes.
  if (instance.state.geometry.zones[args.command.zoneId] === undefined) {
    return acceptMutation()
  }

  // Coarse but sound: any live encounter on this instance blocks retract.
  // Live combatants also stand in occupancy (caught engine-side), but session
  // zone references have no cheap index — refusing outright is safe and
  // matches the delve-has-live-encounter idiom.
  const live = await loadLiveEncounterForMapInstance(instance.id, tx)
  if (live) return refuseMutation("retract-zone-in-encounter")

  const retraction = buildRetraction({
    instanceState: instance.state,
    ledger: dungeon.state.generation,
    zoneId: args.command.zoneId,
  })
  if (!retraction.ok) {
    switch (retraction.error) {
      case "unknown-zone":
        // Screened present above — racing deletes rerun as contention.
        return refuseMutation("expansion-failed")
      case "not-generated":
      case "no-mint-record":
        return refuseMutation("retract-zone-not-generated")
      case "revealed":
        return refuseMutation("retract-zone-revealed")
      case "occupied":
        return refuseMutation("retract-zone-occupied")
      case "not-leaf":
        return refuseMutation("retract-zone-not-leaf")
    }
  }

  const savedDungeon = await saveDungeonState(
    dungeon.id,
    retraction.value.dungeonEvents.reduce(reduceDungeon, dungeon.state),
    dungeon.version,
    tx
  )
  requireStored(savedDungeon)
  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    retraction.value.instanceEvents.reduce(
      createReduceMapInstance(newId),
      instance.state
    ),
    instance.version
  )
  requireStored(savedInstance)
  if (!savedDungeon.ok || !savedInstance.ok) throwMutationContention()
  stamp.record(dungeonAxis(dungeon.id), savedDungeon.value.version)
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
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
      case "expandStub":
        return executeExpandStub(tx, args, evidence.dungeon, stamp)
      case "retractZone":
        return executeRetractZone(tx, args, evidence.dungeon, stamp)
      case "finish":
        return executeFinish(tx, evidence.dungeon, stamp)
      case "startEncounter":
        return executeStartEncounter(tx, args, evidence.dungeon, stamp)
    }
  },
  finalizeAccepted({ args, projection }) {
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
