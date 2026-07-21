import { and, eq } from "drizzle-orm"

import { revision, type MutationHandlerContext } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWriteArgs } from "@/domain/entity/commit/protocol"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
} from "@/domain/entity/commit/writers"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { entityAxisFor } from "@/lib/db/axes"
import { entity, type EntityRow } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"

import { entityVersionIncrement, VERSION_COLUMNS } from "../version-guard"
import type {
  EntityMutationActor,
  EntityMutationRejection,
  EntityMutationTx,
} from "./types"

/**
 * The `entity.write` authority handler (UNN-673, AC #2) — the server-authoritative
 * rebase of the durable component write.
 *
 * Unlike the legacy door, it takes **no client expected-version**: it reads the
 * current class token inside the executor's transaction, applies the same pure
 * Writer the client predicted with, and guards on the version it just read. A
 * lost guard is contention — `throwMutationContention()` rolls the attempt back
 * and the executor reruns against fresh state — never a client-visible stale.
 * Authorization is **not** here; the door owns it (AC #5), so this stays a pure
 * transaction body that throws no framework control flow (contention reruns are
 * safe). The accepted axis is recorded on the stamp accumulator; the executor
 * builds the vector from it and owns cache/realtime finalization — this handler
 * fires no realtime ping.
 */

/** `EntityRow` version-token field for each write class — the read half of the
 *  guard, paired with {@link VERSION_COLUMNS} (the SET/WHERE column half). */
const VERSION_ROW_KEYS = {
  identity: "identityVersion",
  vitals: "vitalsVersion",
  inventory: "inventoryVersion",
  progression: "progressionVersion",
} as const satisfies Record<VersionClass, keyof EntityRow>

export async function executeEntityWrite({
  tx,
  args,
  stamp,
}: MutationHandlerContext<
  EntityMutationTx,
  EntityWriteArgs,
  EntityMutationActor
>): Promise<Result<void, EntityMutationRejection>> {
  const { entityId, write } = args

  // One authoritative observation of the target row inside the attempt.
  const [row] = await tx
    .select()
    .from(entity)
    .where(eq(entity.id, entityId))
    .limit(1)
  if (!row) return err("entity-not-found")

  const loaded = loadEntityRow(row)
  if (!loaded.ok) return err("entity-load-failed")

  // Re-predict on the server with the same pure Writer the client folded.
  const patch = applyEntityWrite(loaded.value.components, write)
  if (!patch.ok) return patch

  const durableClass = ENTITY_WRITERS[write.component].durableClass
  const column = VERSION_COLUMNS[durableClass]
  const expectedVersion = row[VERSION_ROW_KEYS[durableClass]]

  const updated = await tx
    .update(entity)
    .set({ ...patch.value, ...entityVersionIncrement(durableClass) })
    .where(and(eq(entity.id, entityId), eq(column, expectedVersion)))
    .returning({ version: column })

  // Zero rows = the class token moved between our read and write: a lost race,
  // not a rejection. Retry the whole handler against current state.
  if (updated.length === 0) throwMutationContention()

  const nextRevision = revision(updated[0]!.version)
  if (!nextRevision.ok) {
    // A persisted version column that is not a non-negative safe integer is a
    // storage-integrity fault, not an expected outcome.
    throw new Error(
      `entity ${entityId} ${durableClass}Version is not a valid revision`
    )
  }

  stamp.record(entityAxisFor[durableClass](entityId), nextRevision.value)
  return ok(undefined)
}
