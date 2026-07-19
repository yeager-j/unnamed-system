import { eq } from "drizzle-orm"

import {
  createMutationProcessor,
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import { err, ok, type Result } from "@workspace/result"

import {
  combatDurableMutations,
  type CombatDurableInvocation,
  type CombatDurableState,
} from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
} from "@/domain/entity/commit/writers"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { db, type WriteExecutor } from "@/lib/db/client"
import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"
import { entity } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"

import { createEntityLedgerDedupAdapter } from "../../entity/replica/processor"
import {
  entityVersionIncrement,
  VERSION_COLUMNS,
} from "../../entity/version-guard"

/**
 * Per-delivery trusted context, assembled by the push action **outside** the
 * transaction (same shape as the entity door's `EntityPushContext`).
 * `committed` is the door's back-channel — filled only when the domain write
 * actually ran in this delivery, never on a deduplicated replay.
 */
export interface CombatDurablePushContext {
  readonly entityId: string
  readonly authorization: Result<LoadedPlayerCharacter, CombatReplicaRejection>
  committed?: CombatDurableCommit
}

export interface CombatDurableCommit {
  readonly shortId: string
  readonly durableClass: VersionClass
  readonly version: number
}

export type CombatDurablePushProcessor = MutationProcessor<
  CombatDurablePushContext,
  CombatReplicaRejection,
  void
>

/**
 * The combat durable door's authority (UNN-646): the entity door's processor
 * shape over the combat vocabulary — the SAME `replicaClient` ledger (a
 * durable combat client is one ordered stream against one entity, exactly
 * like an owner tab), the same entity-row lock as the concurrency strategy,
 * the same Writer. What differs is the registry: `combat.entity.write`
 * decodes only the `combatEntityWriteSchema` subset, so a non-combat arm
 * (rest, narrative, equipment…) is a RECORDED decode refusal at this door no
 * matter what the client claims. Lock order: `replicaClient` → `entity`.
 */
export function createCombatDurablePushProcessor(
  entityId: string
): CombatDurablePushProcessor {
  return createMutationProcessor<
    CombatDurableState,
    CombatDurableInvocation,
    WriteExecutor,
    CombatDurablePushContext,
    CombatReplicaRejection,
    void
  >({
    mutations: combatDurableMutations,
    transact: (work) => db.transaction(work),
    dedup: createEntityLedgerDedupAdapter(entityId),
    execute: executeCombatDurableMutation,
    onEvent: logProcessorEvent,
  })
}

async function executeCombatDurableMutation(
  tx: WriteExecutor,
  invocation: CombatDurableInvocation,
  context: CombatDurablePushContext
): Promise<Result<void, CombatReplicaRejection>> {
  if (!context.authorization.ok) return context.authorization

  const [row] = await tx
    .select()
    .from(entity)
    .where(eq(entity.id, context.entityId))
    .for("update")
  if (!row) return err("entity-not-found")

  const write = invocation.args
  const durableClass = ENTITY_WRITERS[write.component].durableClass

  const loaded = loadEntityRow(row)
  if (!loaded.ok) return err("entity-load-failed")

  const predicted = applyEntityWrite(loaded.value.components, write)
  if (!predicted.ok) return predicted

  const [updated] = await tx
    .update(entity)
    .set({ ...predicted.value, ...entityVersionIncrement(durableClass) })
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
  }
  return ok(undefined)
}

function logProcessorEvent(event: ProcessorEvent): void {
  if (event.kind === "recorded" && event.outcome === "accepted") return
  console.warn("[combat-replica:durable]", JSON.stringify(event))
}
