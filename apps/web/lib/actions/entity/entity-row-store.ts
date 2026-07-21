import { and, eq } from "drizzle-orm"

import { revision, type StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWriteArgs } from "@/domain/entity/commit/protocol"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
  type EntityWriteRefusal,
} from "@/domain/entity/commit/writers"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import { entityAxisFor } from "@/lib/db/axes"
import type { WriteExecutor } from "@/lib/db/client"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"
import { entity } from "@/lib/db/schema/entity"
import type { PlayerCharacterStatus } from "@/lib/db/schema/player-character"
import type { VersionClass } from "@/lib/db/version-classes"

import { authorizeEntityWrite } from "./authorize-write"
import type { EntityMutationRejection } from "./mutations/types"
import {
  entityVersionIncrement,
  VERSION_COLUMNS,
  VERSION_ROW_KEYS,
} from "./version-guard"

/**
 * The durable **entity Store** (UNN-551; ADR §2.4) — the one native commit path
 * for a component write against an `entity` row, shared by the character surfaces
 * (the entity door), combat's durable arm, and the Headcanon authority handler.
 * `Writer ∘ entityRowStore`, always — no storage fork downstream of the address.
 *
 * Since UNN-674 it is **executor-neutral and server-authoritative**: it takes a
 * supplied executor — the authority's savepoint transaction, or the standalone
 * `db` — and runs the *whole* commit inside it: one authoritative observation of
 * the target, contextual authorization (ownership by the Writer's class + the
 * restricted-Archetype / narrative gates), the pure Writer's predicted patch, and
 * a guarded UPDATE conditioned on the version it *just read* (not a client token).
 * Everything reruns per attempt, so a lost race is contention — the executor
 * reruns against fresh state — never a client-visible stale.
 *
 * It records the advanced axis on the stamp accumulator and returns the committed
 * facts; it fires **no realtime ping and no revalidation** — post-acceptance
 * finalization is the caller's job (the executor's axis invalidation for the
 * Headcanon door, or the standalone doors' own ping + route refresh). Passing a
 * client-composed patch is unrepresentable (descriptor-in, UNN-226): the patch is
 * composed server-side here from the loaded state.
 *
 * **The gate is a fact of the Writer's class (UNN-556).** A `vitals`-class write
 * admits owner-or-campaign-DM (the DM console's sanctioned access); every other
 * class requires the strict owner — a DM must not rewrite a placed player's
 * Origin, Virtues, or narrative (Secrets!) through this door.
 */

/** The standalone door's public error surface: the Writer refusals plus the
 *  authority-load and lost-race outcomes. Authorization refusals are *not* here —
 *  the standalone doors translate them to `forbidden()`; contention is caught and
 *  surfaced as `"stale"` for the un-migrated client's one-shot retry. */
export type EntityWriteError =
  | EntityWriteRefusal
  | "entity-not-found"
  | "entity-load-failed"
  | "stale"

/** The bumped class token, the entity's `shortId` (the pinged channel key), the
 *  bumped class (the ping's payload key), and the PC lifecycle status (the entity
 *  door's revalidation reads it). */
export interface EntityCommit {
  version: number
  shortId: string
  versionClass: VersionClass
  status: PlayerCharacterStatus
}

export async function commitEntityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId, write }: EntityWriteArgs,
  stamp: StampAccumulator
): Promise<Result<EntityCommit, EntityMutationRejection>> {
  const { durableClass } = ENTITY_WRITERS[write.component]

  // One authoritative observation of the target PC (substrate + lifecycle) inside
  // the attempt — authorization, the Writer, and the returned facts all read it.
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc) return err("entity-not-found")

  const authorized = await authorizeEntityWrite(executor, actor, pc, write)
  if (!authorized.ok) return authorized

  const loaded = loadEntityRow(pc.entity)
  if (!loaded.ok) return err("entity-load-failed")

  // Re-predict on the server with the same pure Writer the client folded.
  const patch = applyEntityWrite(loaded.value.components, write)
  if (!patch.ok) return patch

  const column = VERSION_COLUMNS[durableClass]
  const expectedVersion = pc.entity[VERSION_ROW_KEYS[durableClass]]

  const updated = await executor
    .update(entity)
    .set({ ...patch.value, ...entityVersionIncrement(durableClass) })
    .where(and(eq(entity.id, entityId), eq(column, expectedVersion)))
    .returning({ version: column, shortId: entity.shortId })

  // Zero rows = the class token moved between our read and write: a lost race,
  // not a rejection. Retry the whole handler against current state.
  if (updated.length === 0) throwMutationContention()

  const committedVersion = updated[0]!.version
  const nextRevision = revision(committedVersion)
  if (!nextRevision.ok) {
    // A persisted version column that is not a non-negative safe integer is a
    // storage-integrity fault, not an expected outcome.
    throw new Error(
      `entity ${entityId} ${durableClass}Version is not a valid revision`
    )
  }

  stamp.record(entityAxisFor[durableClass](entityId), nextRevision.value)

  return ok({
    version: committedVersion,
    shortId: updated[0]!.shortId,
    versionClass: durableClass,
    status: pc.status,
  })
}
