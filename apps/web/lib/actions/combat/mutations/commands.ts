import "server-only"

import {
  createReduceSession,
  saveSession,
  sweepOverlay,
  type LoadedSession,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { pruneCombat, reduceDungeon } from "@workspace/game-v2/spatial"
import { revision, revisionAt } from "@workspace/headcanon"
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
} from "@workspace/headcanon/next/server"

import {
  combatEnd,
  combatWrite,
  type CombatEndArgs,
  type CombatWriteArgs,
} from "@/domain/combat/commit/protocol"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import type { Actor } from "@/lib/auth/actor"
import { dungeonAxis, encounterAxis, mapInstanceAxis } from "@/lib/db/axes"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadDungeonRowByMapInstanceId } from "@/lib/db/queries/load-dungeon"
import {
  loadEncounterForWrite,
  type LoadedEncounterForWrite,
} from "@/lib/db/queries/load-encounter-session"
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
import {
  publishDungeonInstancePing,
  publishDungeonPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

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

const newId = () => crypto.randomUUID()

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

    const next = createReduceSession(newId)(
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

    const nextRevision = revision(saved.value.version)
    if (!nextRevision.ok) {
      throw new Error(`Encounter ${evidence.row.id} has an invalid revision`)
    }
    stamp.record(encounterAxis(evidence.row.id), nextRevision.value)
    return acceptMutation()
  },
  afterAccepted({ stamp, projection }) {
    revalidateEncounter(projection)

    const version = revisionAt(stamp.revisions, encounterAxis(projection.id))
    if (version !== undefined) {
      publishEncounterPing(projection.shortId, {
        version,
        status: projection.status,
      })
    }
  },
} satisfies MutationCommand<
  typeof combatWrite,
  Actor,
  CombatMutationPreflight,
  CombatMutationTx,
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

    const encounterRevision = revision(ended.value.version)
    const instanceRevision = revision(savedInstance.value.version)
    if (!encounterRevision.ok || !instanceRevision.ok) {
      throw new Error("Combat end produced an invalid revision")
    }
    stamp.record(encounterAxis(row.id), encounterRevision.value)
    stamp.record(mapInstanceAxis(instance.id), instanceRevision.value)

    if (evidence.dungeon) {
      const savedDungeon = await saveDungeonState(
        evidence.dungeon.id,
        reduceDungeon(evidence.dungeon.state, { kind: "advanceTurn" }),
        evidence.dungeon.version,
        tx
      )
      if (!savedDungeon.ok) throwMutationContention()
      const dungeonRevision = revision(savedDungeon.value.version)
      if (!dungeonRevision.ok) {
        throw new Error("Dungeon combat end produced an invalid revision")
      }
      stamp.record(dungeonAxis(evidence.dungeon.id), dungeonRevision.value)
    }
    return acceptMutation()
  },
  afterAccepted({ stamp, projection }) {
    revalidateEncounter(projection.encounter)
    const encounterVersion = revisionAt(
      stamp.revisions,
      encounterAxis(projection.encounter.id)
    )
    if (encounterVersion !== undefined) {
      publishEncounterPing(projection.encounter.shortId, {
        version: encounterVersion,
        status: "ended",
      })
    }
    if (!projection.dungeon) return
    const instanceVersion = revisionAt(
      stamp.revisions,
      mapInstanceAxis(projection.dungeon.mapInstanceId)
    )
    if (instanceVersion !== undefined) {
      publishDungeonInstancePing(projection.dungeon.shortId, instanceVersion)
    }
    const dungeonVersion = revisionAt(
      stamp.revisions,
      dungeonAxis(projection.dungeon.id)
    )
    if (dungeonVersion !== undefined) {
      publishDungeonPing(projection.dungeon.shortId, {
        version: dungeonVersion,
        status: projection.dungeon.status,
      })
    }
  },
} satisfies MutationCommand<
  typeof combatEnd,
  Actor,
  CombatMutationPreflight,
  CombatMutationTx,
  CombatEndProjection,
  AdmittedCombatEnd
>
