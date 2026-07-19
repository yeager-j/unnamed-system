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
import { loadEncounterRosterForWriteLocked } from "@/lib/db/queries/load-encounter-session"
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
  /** The encounter whose combat license this delivery claims. Re-read and
   *  LOCKED inside the transaction — the door does not pre-check it. */
  readonly encounterId: string
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
 * matter what the client claims.
 *
 * **Lock order: `replicaClient` → `encounters` → `entity`.** The middle lock
 * is what the UNN-646 review added, and it is the reason this root's
 * granularity story is honest. A durable combat write is licensed by three
 * things — who the viewer is, that the encounter is live, and that the entity
 * is still on its roster — and the last two live on the encounter row, not
 * the entity row. Checking them outside this transaction let a removal or an
 * end-combat sweep commit in between, after which this delivery would still
 * write to the character. They are now read under the encounter's lock, so
 * those operations serialize against the push instead of racing it.
 *
 * The viewer verdict is still computed at request start (see the door). That
 * gap — a role revoked mid-flight — is recorded as UNN-659, not fixed here.
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

  // The combat license, under the encounter's own lock and BEFORE the entity
  // lock (see the lock order above). Both facts can be revoked by another
  // transaction — `removeParticipant` and the end-combat sweep — so reading
  // them here is what makes those operations serialize with this push.
  const encounter = await loadEncounterRosterForWriteLocked(
    tx,
    context.encounterId
  )
  if (!encounter.ok) return err(encounter.error)
  if (encounter.value.status !== "live") return err("encounter-not-live")
  if (!encounter.value.durableEntityIds.has(context.entityId)) {
    return err("participant-not-found")
  }

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
