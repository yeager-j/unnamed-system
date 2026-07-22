import "server-only"

import {
  addParticipantPaired,
  createReduceSession,
  isRosterFullyPlaced,
  removeParticipantPaired,
  saveSession,
  sweepOverlay,
  type CombatEvent,
  type EncounterState,
  type LoadedSession,
} from "@workspace/game-v2/encounter"
import { loadEntity, type Entity } from "@workspace/game-v2/kernel"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  reduceMapInstance as createReduceMapInstance,
  mapInstanceEventSchema,
  pruneCombat,
  reduceDungeon,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import type { StampAccumulator } from "@workspace/headcanon"
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
  combatEnd,
  combatEvent,
  combatWrite,
  createCombatEventIdFactory,
  type CombatEndArgs,
  type CombatEventArgs,
  type CombatEventRefusal,
  type CombatWriteArgs,
} from "@/domain/combat/commit/protocol"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import { dungeonAxis, encounterAxis, mapInstanceAxis } from "@/lib/db/axes"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadDungeonRowByMapInstanceId } from "@/lib/db/queries/load-dungeon"
import {
  loadEncounterForWrite,
  loadLiveEncounterIdForCampaign,
  type LoadedEncounterForWrite,
} from "@/lib/db/queries/load-encounter-session"
import { loadLiveEntityRowById } from "@/lib/db/queries/load-entity"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  lockDungeonRowForMutation,
  saveDungeonState,
} from "@/lib/db/writes/dungeon"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"

import { revalidateEncounter } from "../../encounter/revalidate"
import {
  authorizeEntityWrite,
  isEntityWriteAuthRejection,
} from "../../entity/authorize-write"
import { commitEntityWrite } from "../../entity/entity-row-store"
import { mintSessionWriteEvent } from "../commit/mint-session-write-event"

type CombatMutationTx = DrizzleMutationTx<ReturnType<typeof getDb>>
type CombatMutationPreflight = ReturnType<typeof getDb>
type CombatProjection = Pick<EncounterRow, "id" | "shortId" | "status">
type CombatMutation = typeof combatEvent | typeof combatWrite | typeof combatEnd
type CombatMutationCommand<
  Mutation extends CombatMutation,
  Projection,
  Evidence,
> = MutationCommand<
  Mutation,
  Actor,
  CombatMutationPreflight,
  CombatMutationTx,
  Projection,
  Evidence
>

type AdmittedCombatWrite =
  | {
      readonly found: false
      readonly row: EncounterRow
    }
  | {
      readonly found: true
      readonly storage: "inline"
      readonly row: EncounterRow
      readonly loaded: LoadedSession
      readonly participantId: ParticipantId
    }
  | {
      readonly found: true
      readonly storage: "durable"
      readonly row: EncounterRow
      readonly entityId: string
    }

async function admitCombatEvent(
  executor: WriteExecutor,
  actor: Actor,
  args: CombatEventArgs
) {
  const encounter = await loadEncounterForWrite(args.encounterId, executor)
  if (!encounter.ok) return denyMutation()
  const campaign = await loadCampaignRowById(
    encounter.value.row.campaignId,
    executor
  )
  if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
  return allowMutation(encounter.value)
}

function isMapInstanceEvent(
  event: CombatEventArgs["event"]
): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}

async function saveEncounterState(
  tx: WriteExecutor,
  encounter: LoadedEncounterForWrite,
  session: LoadedSession["session"],
  stamp: StampAccumulator
): Promise<MutationCommandDecision<CombatEventRefusal>> {
  const stored = saveSession(session, encounter.loaded.locators)
  if (!stored.ok) return refuseMutation("locator-missing")
  const saved = await saveEncounterSession(
    encounter.row.id,
    stored.value,
    encounter.row.version,
    tx
  )
  if (!saved.ok) throwMutationContention()
  stamp.record(encounterAxis(encounter.row.id), saved.value.version)
  return acceptMutation()
}

async function saveEncounterAndInstance(
  tx: WriteExecutor,
  encounter: LoadedEncounterForWrite,
  next: EncounterState,
  stamp: StampAccumulator
): Promise<MutationCommandDecision<CombatEventRefusal>> {
  const stored = saveSession(next.session, encounter.loaded.locators)
  if (!stored.ok) return refuseMutation("locator-missing")
  const savedEncounter = await saveEncounterSession(
    encounter.row.id,
    stored.value,
    encounter.row.version,
    tx
  )
  if (!savedEncounter.ok) throwMutationContention()
  const instance = await loadMapInstanceById(encounter.row.mapInstanceId, tx)
  if (!instance) return refuseMutation("map-instance-not-found")
  const savedInstance = await saveMapInstanceState(
    tx,
    instance.id,
    next.mapInstance,
    instance.version
  )
  if (!savedInstance.ok) throwMutationContention()
  stamp.record(encounterAxis(encounter.row.id), savedEncounter.value.version)
  stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)
  return acceptMutation()
}

async function executeCombatEvent(
  tx: WriteExecutor,
  args: CombatEventArgs,
  encounter: LoadedEncounterForWrite,
  stamp: StampAccumulator,
  mutationId: string
): Promise<MutationCommandDecision<CombatEventRefusal>> {
  const event = args.event
  const newId = createCombatEventIdFactory(mutationId)

  if (isMapInstanceEvent(event)) {
    const instance = await loadMapInstanceById(encounter.row.mapInstanceId, tx)
    if (!instance) return refuseMutation("map-instance-not-found")
    const saved = await saveMapInstanceState(
      tx,
      instance.id,
      createReduceMapInstance(newId)(instance.state, event),
      instance.version
    )
    if (!saved.ok) throwMutationContention()
    stamp.record(mapInstanceAxis(instance.id), saved.value.version)
    return acceptMutation()
  }

  if (event.kind === "addParticipant") {
    const participantId = event.setup.id ?? asParticipantId(newId())
    let entity: Entity
    if ("entityId" in event.setup) {
      const row = await loadLiveEntityRowById(event.setup.entityId, tx)
      if (!row) return refuseMutation("character-not-found")
      const loaded = loadEntityRow(row)
      if (!loaded.ok) return refuseMutation("invalid-entity")
      entity = loaded.value
      encounter.loaded.locators.set(participantId, {
        storage: "durable",
        entityId: event.setup.entityId,
      })
    } else {
      const loaded = loadEntity(
        event.setup.entity.id,
        event.setup.entity.components
      )
      if (!loaded.ok) return refuseMutation("invalid-entity")
      entity = loaded.value
      encounter.loaded.locators.set(participantId, {
        storage: "inline",
        entity: event.setup.entity,
      })
    }

    const addEvent = {
      kind: "addParticipant",
      setup: { id: participantId, side: event.setup.side, entity },
    } satisfies Extract<CombatEvent, { kind: "addParticipant" }>
    if (event.setup.zoneId === undefined) {
      return saveEncounterState(
        tx,
        encounter,
        createReduceSession(newId)(encounter.loaded.session, addEvent),
        stamp
      )
    }

    const instance = await loadMapInstanceById(encounter.row.mapInstanceId, tx)
    if (!instance) return refuseMutation("map-instance-not-found")
    return saveEncounterAndInstance(
      tx,
      encounter,
      addParticipantPaired(newId)(
        { session: encounter.loaded.session, mapInstance: instance.state },
        addEvent,
        event.setup.zoneId
      ),
      stamp
    )
  }

  if (event.kind === "removeParticipant") {
    const instance = await loadMapInstanceById(encounter.row.mapInstanceId, tx)
    if (!instance) return refuseMutation("map-instance-not-found")
    return saveEncounterAndInstance(
      tx,
      encounter,
      removeParticipantPaired(newId)(
        { session: encounter.loaded.session, mapInstance: instance.state },
        event
      ),
      stamp
    )
  }

  if (event.kind === "startCombat") {
    const live = await loadLiveEncounterIdForCampaign(
      encounter.row.campaignId,
      tx
    )
    if (live !== null && live !== encounter.row.id) {
      return refuseMutation("campaign-already-has-live-encounter")
    }
    const instance = await loadMapInstanceById(encounter.row.mapInstanceId, tx)
    if (!instance) return refuseMutation("map-instance-not-found")
    if (!isRosterFullyPlaced(encounter.loaded.session, instance.state)) {
      return refuseMutation("encounter-has-unplaced-combatants")
    }
    const session = createReduceSession(newId)(encounter.loaded.session, event)
    const stored = saveSession(session, encounter.loaded.locators)
    if (!stored.ok) return refuseMutation("locator-missing")
    const saved = await saveEncounterSession(
      encounter.row.id,
      stored.value,
      encounter.row.version,
      tx
    )
    if (!saved.ok) throwMutationContention()
    const liveEncounter = await setEncounterStatus(
      encounter.row.id,
      "live",
      saved.value.version,
      tx
    )
    if (!liveEncounter.ok) throwMutationContention()
    stamp.record(encounterAxis(encounter.row.id), liveEncounter.value.version)
    return acceptMutation()
  }

  return saveEncounterState(
    tx,
    encounter,
    createReduceSession(newId)(encounter.loaded.session, event),
    stamp
  )
}

export const combatEventCommand = {
  async screen({ executor, actor, args }) {
    const admitted = await admitCombatEvent(executor, actor, args)
    return admitted.kind === "allowed"
      ? allowMutationScreening<CombatProjection>({
          id: admitted.evidence.row.id,
          shortId: admitted.evidence.row.shortId,
          status: admitted.evidence.row.status,
        })
      : admitted
  },
  admit: ({ tx, actor, args }) => admitCombatEvent(tx, actor, args),
  execute: ({ tx, args, evidence, stamp, mutationId }) =>
    executeCombatEvent(tx, args, evidence, stamp, mutationId),
  finalizeAccepted({ projection }) {
    revalidateEncounter(projection)
  },
} satisfies CombatMutationCommand<
  typeof combatEvent,
  CombatProjection,
  LoadedEncounterForWrite
>

async function admitCombatWrite(
  executor: WriteExecutor,
  actor: Actor,
  args: CombatWriteArgs
) {
  const encounter = await loadEncounterForWrite(args.encounterId, executor)
  if (!encounter.ok) {
    if (encounter.error === "encounter-not-found") return denyMutation()
    throw new Error(`Unable to load encounter: ${encounter.error}`)
  }

  const locator = encounter.value.loaded.locators.get(args.participantId)
  if (!locator) {
    const campaign = await loadCampaignRowById(
      encounter.value.row.campaignId,
      executor
    )
    if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
    return allowMutation<AdmittedCombatWrite>({
      found: false,
      row: encounter.value.row,
    })
  }

  if (locator.storage === "inline") {
    const campaign = await loadCampaignRowById(
      encounter.value.row.campaignId,
      executor
    )
    if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
    return allowMutation<AdmittedCombatWrite>({
      found: true,
      storage: "inline",
      row: encounter.value.row,
      loaded: encounter.value.loaded,
      participantId: args.participantId,
    })
  }

  // The composed Store repeats this authoritative load and policy check during
  // execution. Screening also keeps unauthorized calls outside receipt creation.
  const preview = await commitEntityWritePreview(
    executor,
    actor,
    locator.entityId,
    args.write
  )
  if (!preview) return denyMutation()

  return allowMutation<AdmittedCombatWrite>({
    found: true,
    storage: "durable",
    row: encounter.value.row,
    entityId: locator.entityId,
  })
}

async function commitEntityWritePreview(
  executor: WriteExecutor,
  actor: Actor,
  entityId: string,
  write: CombatEntityWrite
): Promise<boolean> {
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc) return false
  return (await authorizeEntityWrite(executor, actor, pc, write)).ok
}

export const combatWriteCommand = {
  async screen({ executor, actor, args }) {
    const screened = await admitCombatWrite(executor, actor, args)
    return screened.kind === "allowed"
      ? allowMutationScreening<CombatProjection>({
          id: screened.evidence.row.id,
          shortId: screened.evidence.row.shortId,
          status: screened.evidence.row.status,
        })
      : screened
  },
  admit: ({ tx, actor, args }) => admitCombatWrite(tx, actor, args),
  async execute({ tx, actor, args, evidence, stamp }) {
    if (!evidence.found) return refuseMutation("participant-not-found")

    if (evidence.storage === "durable") {
      const committed = await commitEntityWrite(
        tx,
        actor,
        { entityId: evidence.entityId, write: args.write },
        stamp
      )
      if (committed.ok) return acceptMutation()
      if (
        committed.error === "entity-not-found" ||
        isEntityWriteAuthRejection(committed.error)
      ) {
        return denyMutation()
      }
      if (committed.error === "entity-load-failed") {
        throw new Error(`Unable to load entity ${evidence.entityId}`)
      }
      return refuseMutation(committed.error)
    }

    const participant = evidence.loaded.session.participants.find(
      (entry) => entry.id === evidence.participantId
    )
    if (!participant) return denyMutation()

    const predicted = applyEntityWrite(
      participant.entity.components,
      args.write
    )
    if (!predicted.ok) return refuseMutation(predicted.error)

    const next = createReduceSession(() => crypto.randomUUID())(
      evidence.loaded.session,
      mintSessionWriteEvent(evidence.participantId, args.write)
    )
    const stored = saveSession(next, evidence.loaded.locators)
    if (!stored.ok) {
      throw new Error("Unable to save encounter because a locator is missing")
    }

    const saved = await saveEncounterSession(
      evidence.row.id,
      stored.value,
      evidence.row.version,
      tx
    )
    if (!saved.ok) throwMutationContention()

    stamp.record(encounterAxis(evidence.row.id), saved.value.version)
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateEncounter(projection)
  },
} satisfies CombatMutationCommand<
  typeof combatWrite,
  CombatProjection,
  AdmittedCombatWrite
>

interface CombatEndProjection {
  readonly encounter: CombatProjection
  readonly dungeon: Pick<
    DungeonRow,
    "id" | "shortId" | "mapInstanceId" | "status"
  > | null
}

interface AdmittedCombatEnd {
  readonly encounter: LoadedEncounterForWrite
  readonly dungeon: DungeonRow | null
}

async function loadCombatEndAdmission(
  executor: WriteExecutor,
  actor: Actor,
  args: CombatEndArgs,
  lockDungeon: boolean
) {
  let encounter = await loadEncounterForWrite(args.encounterId, executor)
  if (!encounter.ok) return denyMutation()

  const discoveredDungeon = await loadDungeonRowByMapInstanceId(
    encounter.value.row.mapInstanceId,
    executor
  )
  let dungeon = discoveredDungeon
  if (discoveredDungeon && lockDungeon) {
    const locked = await lockDungeonRowForMutation(
      executor,
      discoveredDungeon.id
    )
    if (!locked.ok) return denyMutation()
    dungeon = locked.value
    encounter = await loadEncounterForWrite(args.encounterId, executor)
    if (!encounter.ok) return denyMutation()
    if (encounter.value.row.mapInstanceId !== dungeon.mapInstanceId) {
      return denyMutation()
    }
  }

  const campaign = await loadCampaignRowById(
    encounter.value.row.campaignId,
    executor
  )
  if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
  return allowMutation<AdmittedCombatEnd>({
    encounter: encounter.value,
    dungeon,
  })
}

export const combatEndCommand = {
  async screen({ executor, actor, args }) {
    const admitted = await loadCombatEndAdmission(executor, actor, args, false)
    return admitted.kind === "allowed"
      ? allowMutationScreening<CombatEndProjection>({
          encounter: {
            id: admitted.evidence.encounter.row.id,
            shortId: admitted.evidence.encounter.row.shortId,
            status: admitted.evidence.encounter.row.status,
          },
          dungeon: admitted.evidence.dungeon
            ? {
                id: admitted.evidence.dungeon.id,
                shortId: admitted.evidence.dungeon.shortId,
                mapInstanceId: admitted.evidence.dungeon.mapInstanceId,
                status: admitted.evidence.dungeon.status,
              }
            : null,
        })
      : admitted
  },
  admit: ({ tx, actor, args }) => loadCombatEndAdmission(tx, actor, args, true),
  async execute({ tx, evidence, stamp }) {
    const { row, loaded } = evidence.encounter
    if (row.status !== "live") return refuseMutation("encounter-not-live")
    const instance = await loadMapInstanceById(row.mapInstanceId, tx)
    if (!instance) return refuseMutation("map-instance-not-found")

    const swept = sweepOverlay(loaded.session)
    const stored = saveSession(swept, loaded.locators)
    if (!stored.ok) return refuseMutation("locator-missing")
    const ephemeralIds = loaded.session.participants
      .filter(
        (participant) =>
          loaded.locators.get(participant.id)?.storage === "inline"
      )
      .map((participant) => participant.id)
    const pruned = pruneCombat(instance.state, ephemeralIds)

    const savedInstance = await saveMapInstanceState(
      tx,
      instance.id,
      pruned,
      instance.version
    )
    if (!savedInstance.ok) throwMutationContention()
    const savedEncounter = await saveEncounterSession(
      row.id,
      stored.value,
      row.version,
      tx
    )
    if (!savedEncounter.ok) throwMutationContention()
    const ended = await setEncounterStatus(
      row.id,
      "ended",
      savedEncounter.value.version,
      tx
    )
    if (!ended.ok) throwMutationContention()

    stamp.record(encounterAxis(row.id), ended.value.version)
    stamp.record(mapInstanceAxis(instance.id), savedInstance.value.version)

    if (evidence.dungeon) {
      const savedDungeon = await saveDungeonState(
        evidence.dungeon.id,
        reduceDungeon(evidence.dungeon.state, { kind: "advanceTurn" }),
        evidence.dungeon.version,
        tx
      )
      if (!savedDungeon.ok) throwMutationContention()
      stamp.record(dungeonAxis(evidence.dungeon.id), savedDungeon.value.version)
    }
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateEncounter(projection.encounter)
  },
} satisfies CombatMutationCommand<
  typeof combatEnd,
  CombatEndProjection,
  AdmittedCombatEnd
>
