import { and, eq, lt } from "drizzle-orm"

import {
  createMutationProcessor,
  type MutationDedupAdapter,
  type MutationProcessor,
  type ProcessorEvent,
  type RecordedOutcome,
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

import {
  entityVersionIncrement,
  VERSION_COLUMNS,
  type EntityRowPatch,
} from "../version-guard"

/**
 * Dedup rows idle past this window are swept opportunistically inside the
 * processor's transaction (UNN-645 retention decision: last-outcome-only rows,
 * cleanup pressure riding write traffic — no cron). Consequence, documented
 * rather than hidden: a tab that stays open but silent past the TTL loses its
 * row, and its next push is a `gap` refusal — the client must rebootstrap
 * from a fresh accepted snapshot (the same recovery a lost local state needs).
 */
const DEDUP_TTL_MS = 30 * 24 * 60 * 60 * 1000

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
    dedup: createDedupAdapter(entityId),
    execute: executeEntityMutation,
    onEvent: logProcessorEvent,
  })
}

function createDedupAdapter(
  entityId: string
): MutationDedupAdapter<WriteExecutor, void, EntityReplicaRejection> {
  return {
    async acquire(tx, client) {
      // The row is minted at the client's BOOTSTRAP — the personalized
      // snapshot read — never here (Codex P2, PR #385): with an evicting
      // sweep, an absent row must mean "swept or never bootstrapped", so a
      // redelivered first mutation that may have committed before the sweep
      // is refused `unknown-client` instead of silently re-executed. The
      // bootstrap-minted row is also what `FOR UPDATE` serializes on for a
      // client's first delivery.
      const [row] = await tx
        .select()
        .from(replicaClient)
        .where(
          and(
            eq(replicaClient.clientGroupId, client.clientGroupId),
            eq(replicaClient.clientId, client.clientId)
          )
        )
        .for("update")
      if (!row) return null
      if (row.entityId !== entityId) {
        // A client identity is one ordered stream against ONE entity; reuse
        // across entities is a client bug. Throwing aborts the transaction
        // (ambiguous, no state advanced) instead of corrupting the ledger.
        throw new Error(
          `replica client ${client.clientGroupId}/${client.clientId} is pinned to another entity`
        )
      }
      return {
        lastMutationId: row.lastMutationId,
        // Written exclusively by `record` below under the same schema; the
        // stored shape is this door's own recorded outcome, not foreign input.
        lastOutcome: (row.lastOutcome ?? undefined) as
          | RecordedOutcome<void, EntityReplicaRejection>
          | undefined,
      }
    },

    async record(tx, client, mutationId, outcome) {
      await tx
        .update(replicaClient)
        .set({
          lastMutationId: mutationId,
          lastOutcome: outcome,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(replicaClient.clientGroupId, client.clientGroupId),
            eq(replicaClient.clientId, client.clientId)
          )
        )
      // Opportunistic sweep: abandoned tabs' rows for this entity, idle past
      // the TTL. Rides the same transaction — cleanup can never outrun the
      // write that funds it.
      await tx
        .delete(replicaClient)
        .where(
          and(
            eq(replicaClient.entityId, entityId),
            lt(replicaClient.updatedAt, new Date(Date.now() - DEDUP_TTL_MS))
          )
        )
    },
  }
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
