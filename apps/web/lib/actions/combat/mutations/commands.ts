import "server-only"

import {
  createReduceSession,
  saveSession,
  type LoadedSession,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { revision, revisionAt } from "@workspace/headcanon"
import {
  throwMutationContention,
  type DrizzleMutationTx,
} from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  denyMutation,
  refuseMutation,
  type MutationCommand,
} from "@workspace/headcanon/next/server"

import {
  combatWrite,
  type CombatWriteArgs,
} from "@/domain/combat/commit/protocol"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import type { Actor } from "@/lib/auth/actor"
import { encounterAxis } from "@/lib/db/axes"
import { getDb, type WriteExecutor } from "@/lib/db/client"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadEncounterForWrite } from "@/lib/db/queries/load-encounter-session"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { publishEncounterPing } from "@/lib/realtime/publish"

import { revalidateEncounter } from "../../encounter/revalidate"
import {
  authorizeEntityWrite,
  isEntityWriteAuthRejection,
} from "../../entity/authorize-write"
import { commitEntityWrite } from "../../entity/entity-row-store"
import { mintSessionWriteEvent } from "../commit/mint-session-write-event"

type CombatMutationTx = DrizzleMutationTx<ReturnType<typeof getDb>>
type CombatMutationPreflight = ReturnType<typeof getDb>

type AdmittedCombatWrite =
  | {
      readonly storage: "inline"
      readonly row: EncounterRow
      readonly loaded: LoadedSession
      readonly participantId: ParticipantId
    }
  | {
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
  if (!locator) return denyMutation()

  if (locator.storage === "inline") {
    const campaign = await loadCampaignRowById(
      encounter.value.row.campaignId,
      executor
    )
    if (!campaign || campaign.dmUserId !== actor.userId) return denyMutation()
    return allowMutation<AdmittedCombatWrite>({
      storage: "inline",
      row: encounter.value.row,
      loaded: encounter.value.loaded,
      participantId: args.participantId,
    })
  }

  // The composed Store repeats this authoritative load and policy check during
  // execution. This preflight keeps unauthorized calls outside receipt creation.
  const preview = await commitEntityWritePreview(
    executor,
    actor,
    locator.entityId,
    args.write
  )
  if (!preview) return denyMutation()

  return allowMutation<AdmittedCombatWrite>({
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
  admit: ({ executor, actor, args }) => admitCombatWrite(executor, actor, args),
  async execute({ tx, actor, args, evidence, stamp }) {
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
  afterAccepted({ stamp, preflight }) {
    revalidateEncounter(preflight.row)
    if (preflight.storage !== "inline") return

    const version = revisionAt(stamp.revisions, encounterAxis(preflight.row.id))
    if (version !== undefined) {
      publishEncounterPing(preflight.row.shortId, {
        version,
        status: preflight.row.status,
      })
    }
  },
} satisfies MutationCommand<
  typeof combatWrite,
  Actor,
  CombatMutationPreflight,
  CombatMutationTx,
  AdmittedCombatWrite
>
