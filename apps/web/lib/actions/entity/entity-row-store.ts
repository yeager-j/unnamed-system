import { type StampAccumulator } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWriteArgs } from "@/domain/entity/commit/protocol"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
  type EntityWriteRefusal,
} from "@/domain/entity/commit/writers"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import type { Actor } from "@/lib/auth/actor"
import type { WriteExecutor } from "@/lib/db/client"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import type { VersionClass } from "@/lib/db/version-classes"

import {
  authorizeEntityWrite,
  type EntityWriteAuthRejection,
} from "./authorize-write"
import { advanceEntityAxisGuarded } from "./version-guard"

/**
 * The durable **entity Store** (UNN-551; ADR §2.4) — the one native commit path
 * for a component write against an `entity` row. The mutation command uses its
 * admitted and commit halves; combat's durable arm retains the one-call
 * `commitEntityWrite` composition over those exact halves. `Writer ∘
 * entityRowStore`, always — no storage fork downstream of the address.
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
 * facts; it fires **no transport or route-cache side effects itself** — the
 * registered Headcanon action finalizes the stamp and axis invalidation, then
 * invokes the command's explicit projection callback. Passing a
 * client-composed patch is unrepresentable (descriptor-in, UNN-226): the patch is
 * composed server-side here from the loaded state.
 *
 * **The gate is a fact of the Writer's class (UNN-556).** A `vitals`-class write
 * admits owner-or-campaign-DM (the DM console's sanctioned access); every other
 * class requires the strict owner — a DM must not rewrite a placed player's
 * Origin, Virtues, or narrative (Secrets!) through this Store.
 */

export type EntityWriteCommitRejection =
  | EntityWriteRefusal
  | "entity-not-found"
  | "entity-load-failed"
  | EntityWriteAuthRejection

export interface AdmittedEntityWrite {
  readonly pc: LoadedPlayerCharacter
  readonly versionClass: VersionClass
}

/** @internal The mutation manifest's attempt-local admission half. */
export async function admitEntityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId, write }: EntityWriteArgs
): Promise<
  Result<AdmittedEntityWrite, "entity-not-found" | EntityWriteAuthRejection>
> {
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc) return err("entity-not-found")

  const authorized = await authorizeEntityWrite(executor, actor, pc, write)
  if (!authorized.ok) return authorized

  return ok({
    pc,
    versionClass: ENTITY_WRITERS[write.component].durableClass,
  })
}

/** @internal Commits only evidence minted by {@link admitEntityWrite}. */
export async function commitAdmittedEntityWrite(
  executor: WriteExecutor,
  { write }: EntityWriteArgs,
  admitted: AdmittedEntityWrite,
  stamp: StampAccumulator
): Promise<Result<void, EntityWriteRefusal | "entity-load-failed">> {
  const loaded = loadEntityRow(admitted.pc.entity)
  if (!loaded.ok) return err("entity-load-failed")

  const patch = applyEntityWrite(loaded.value.components, write)
  if (!patch.ok) return patch

  await advanceEntityAxisGuarded(
    executor,
    admitted.pc.entity,
    admitted.versionClass,
    patch.value,
    stamp
  )

  return ok(undefined)
}

export async function commitEntityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId, write }: EntityWriteArgs,
  stamp: StampAccumulator
): Promise<Result<void, EntityWriteCommitRejection>> {
  const args = { entityId, write }
  const admitted = await admitEntityWrite(executor, actor, args)
  if (!admitted.ok) return admitted
  return commitAdmittedEntityWrite(executor, args, admitted.value, stamp)
}
