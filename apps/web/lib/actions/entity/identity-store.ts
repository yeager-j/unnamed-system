import { type StampAccumulator } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import { identityWritePatch } from "@/domain/entity/commit/identity"
import type { EntityIdentityArgs } from "@/domain/entity/commit/protocol"
import type { Actor } from "@/lib/auth/actor"
import type { WriteExecutor } from "@/lib/db/client"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"

import type { EntityWriteAuthRejection } from "./authorize-write"
import { advanceEntityAxisGuarded } from "./version-guard"

/**
 * The **identity-column Store** (Headcanon P2c — UNN-675) — the one commit path
 * for an app-owned column write, and the app-column peer of
 * {@link import("./entity-row-store").commitEntityWrite}.
 *
 * Executor-neutral and server-authoritative in the same shape (UNN-674): it takes
 * a supplied executor — the authority's savepoint transaction — and runs the whole
 * commit inside it: one authoritative observation of the target, ownership
 * authorization, the server-composed column patch, and a guarded UPDATE
 * conditioned on the `identityVersion` it *just read*. Everything reruns per
 * attempt, so a lost race is contention for the executor to retry, never a
 * client-visible stale.
 *
 * **Why its authorization is simpler than the component Store's.** There the
 * posture is a fact of the Writer's class — `vitals` admits owner-or-campaign-DM,
 * everything else strict owner — plus the restricted-Archetype / narrative gates.
 * An identity column has no Writer and no class to derive: name, pronouns,
 * portrait, and notes are always strict-owner, and no Archetype spend can hide
 * behind them. Sharing `authorize-write`'s rule would mean deriving a class the
 * descriptor does not carry, so the two rules stay separate. The mutation
 * command translates a failed admission to package denial; combat's standalone
 * component Store still uses
 * {@link import("./authorize-write").isEntityWriteAuthRejection}.
 *
 * It records the advanced axis on the stamp accumulator and fires **no realtime
 * ping and no revalidation** — post-acceptance finalization is the caller's.
 */

/** A terminal domain refusal for `entity.identity`. Contention is deliberately
 *  absent: a lost guarded write throws for the authority to retry. */
export type IdentityWriteRejection =
  | "entity-not-found"
  | EntityWriteAuthRejection

/** The bumped identity token and the entity's `shortId` for accepted projection. */
export interface IdentityCommit {
  version: number
  shortId: string
}

export interface AdmittedIdentityWrite {
  readonly pc: LoadedPlayerCharacter
}

/** @internal The mutation manifest's attempt-local admission half. */
export async function admitIdentityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId }: EntityIdentityArgs
): Promise<Result<AdmittedIdentityWrite, IdentityWriteRejection>> {
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc) return err("entity-not-found")
  if (pc.userId !== actor.userId) return err("unauthorized")
  return ok({ pc })
}

/** @internal Commits only evidence minted by {@link admitIdentityWrite}. */
export async function commitAdmittedIdentityWrite(
  executor: WriteExecutor,
  { write }: EntityIdentityArgs,
  admitted: AdmittedIdentityWrite,
  stamp: StampAccumulator
): Promise<Result<IdentityCommit, never>> {
  const version = await advanceEntityAxisGuarded(
    executor,
    admitted.pc.entity,
    "identity",
    identityWritePatch(write),
    stamp
  )

  return ok({ version, shortId: admitted.pc.entity.shortId })
}

export async function commitIdentityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId, write }: EntityIdentityArgs,
  stamp: StampAccumulator
): Promise<Result<IdentityCommit, IdentityWriteRejection>> {
  const args = { entityId, write }
  const admitted = await admitIdentityWrite(executor, actor, args)
  if (!admitted.ok) return admitted
  return commitAdmittedIdentityWrite(executor, args, admitted.value, stamp)
}
