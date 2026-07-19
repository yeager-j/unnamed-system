import { eq } from "drizzle-orm"

import {
  createMutationProcessor,
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import { err, ok, type Result } from "@workspace/result"

import {
  applyEntityWrite,
  ENTITY_WRITERS,
} from "@/domain/entity/commit/writers"
import {
  entityColumnPatch,
  entityReplicaMutations,
  type EntityReplicaInvocation,
  type EntityReplicaState,
} from "@/domain/entity/replica/mutations"
import type { EntityReplicaRejection } from "@/domain/entity/replica/rejection"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { db, type WriteExecutor } from "@/lib/db/client"
import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"
import { entity } from "@/lib/db/schema/entity"
import { replicaClient } from "@/lib/db/schema/replica-client"
import type { VersionClass } from "@/lib/db/version-classes"

import { createDrizzleMutationDedupAdapter } from "../../replica/drizzle-ledger"
import {
  entityVersionIncrement,
  VERSION_COLUMNS,
  type EntityRowPatch,
} from "../version-guard"

/**
 * Per-delivery trusted context, assembled by the push action **outside** the
 * transaction: the entity the client group addresses and the viewer's
 * authorization verdict (auth reads are policy, not part of the write's
 * atomicity). `committed` is the door's back-channel — `execute` fills it only
 * when the domain write actually ran in this delivery, so the action pings and
 * revalidates exactly once per commit and never for a deduplicated replay.
 */
export interface EntityPushContext {
  readonly entityId: string
  readonly authorization: Result<LoadedPlayerCharacter, EntityReplicaRejection>
  committed?: EntityPushCommit
}

/** What the action needs after commit: the ping key + class/version payload,
 *  and the written component (its list-revalidation discriminant). */
export interface EntityPushCommit {
  readonly shortId: string
  readonly durableClass: VersionClass
  readonly version: number
  readonly revalidateList: boolean
}

export type EntityPushProcessor = MutationProcessor<
  EntityPushContext,
  EntityReplicaRejection,
  void
>

/**
 * The production authority for the entity replica mutations (UNN-645/648;
 * design §Authority-side
 * processing): `createMutationProcessor` over one Drizzle transaction per
 * delivery. Inside the transaction it locks the client's dedup row (insert-
 * if-absent, then `FOR UPDATE` — the lock exists even for a first delivery),
 * answers duplicates from the recorded outcome, rejects gaps before any
 * application code, and for the next-in-order ID runs the domain write and
 * records the terminal outcome atomically with it.
 *
 * The domain write holds the **entity row lock** (`SELECT … FOR UPDATE`)
 * from read to commit, so the read → Writer → UPDATE sequence cannot lose a
 * race; there is no client-supplied `expectedVersion` on this door — the
 * class version still bumps (the vector is the snapshot cursor and the ping
 * payload other consumers key on), but the lock, not the guard, is the
 * concurrency strategy. **Lock order: `replicaClient` → `entity`.** Every
 * future multi-row extension of this transaction must keep that order.
 *
 * Two semantics inherited from the module (do not "fix" them here): a typed
 * refusal — including `forbidden` and a failed decode — is RECORDED and
 * advances the watermark (refusing to advance would wedge the client's
 * ordered queue, the deploy-skew landmine), and only an unexpected throw
 * aborts the transaction, leaving the delivery ambiguous for redelivery.
 */
export function createEntityPushProcessor(
  entityId: string
): EntityPushProcessor {
  return createMutationProcessor<
    EntityReplicaState,
    EntityReplicaInvocation,
    WriteExecutor,
    EntityPushContext,
    EntityReplicaRejection,
    void
  >({
    mutations: entityReplicaMutations,
    transact: (work) => db.transaction(work),
    dedup: createDrizzleMutationDedupAdapter<
      void,
      EntityReplicaRejection,
      typeof replicaClient
    >({
      table: replicaClient,
      pinColumn: replicaClient.entityId,
      pinValue: entityId,
    }),
    execute: executeEntityMutation,
    onEvent: logProcessorEvent,
  })
}

async function executeEntityMutation(
  tx: WriteExecutor,
  invocation: EntityReplicaInvocation,
  context: EntityPushContext
): Promise<Result<void, EntityReplicaRejection>> {
  if (!context.authorization.ok) return context.authorization

  const [row] = await tx
    .select()
    .from(entity)
    .where(eq(entity.id, context.entityId))
    .for("update")
  if (!row) return err("entity-not-found")

  let patch: EntityRowPatch
  let durableClass: VersionClass
  let revalidateList: boolean

  switch (invocation.name) {
    case "entity.write": {
      const write = invocation.args
      durableClass = ENTITY_WRITERS[write.component].durableClass

      const loaded = loadEntityRow(row)
      if (!loaded.ok) return err("entity-load-failed")

      const predicted = applyEntityWrite(loaded.value.components, write)
      if (!predicted.ok) return predicted

      patch = predicted.value
      revalidateList =
        write.component === "level" || write.component === "archetypes"
      break
    }
    case "entity.setColumn":
      durableClass = "identity"
      patch = entityColumnPatch(invocation.args)
      revalidateList =
        invocation.args.column === "name" ||
        invocation.args.column === "portraitUrl"
      break
  }

  const [updated] = await tx
    .update(entity)
    .set({ ...patch, ...entityVersionIncrement(durableClass) })
    .where(eq(entity.id, context.entityId))
    .returning({
      version: VERSION_COLUMNS[durableClass],
      shortId: entity.shortId,
    })
  if (!updated) {
    // Unreachable while this transaction holds the row lock; a throw aborts
    // rather than recording a refusal for a write whose fate is unknown.
    throw new Error(`entity ${context.entityId} vanished under its row lock`)
  }

  context.committed = {
    shortId: updated.shortId,
    durableClass,
    version: updated.version,
    revalidateList,
  }
  return ok(undefined)
}

/**
 * The server half of the observability AC (UNN-645): anomalies — duplicates,
 * gaps, aged-out outcomes, refused recordings — log at warn; accepted
 * recordings stay quiet (routine traffic is already visible as requests).
 */
function logProcessorEvent(event: ProcessorEvent): void {
  if (event.kind === "recorded" && event.outcome === "accepted") return
  console.warn("[entity-replica]", JSON.stringify(event))
}
