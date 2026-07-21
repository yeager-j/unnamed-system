import { type StampAccumulator } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import { identityWritePatch } from "@/domain/entity/commit/identity"
import type { EntityIdentityArgs } from "@/domain/entity/commit/protocol"
import type { Actor } from "@/lib/auth/actor"
import type { WriteExecutor } from "@/lib/db/client"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"

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
 * descriptor does not carry, so the two rules stay separate — but they speak the
 * same `"unauthorized"` rejection, so the doors' 403 translation
 * ({@link import("./authorize-write").isEntityWriteAuthRejection}) is one decision.
 *
 * It records the advanced axis on the stamp accumulator and fires **no realtime
 * ping and no revalidation** — post-acceptance finalization is the caller's.
 */

/** A terminal domain refusal for `entity.identity`. Contention is deliberately
 *  absent: a lost guarded write throws for the authority to retry. */
export type IdentityWriteRejection =
  | "entity-not-found"
  | EntityWriteAuthRejection

/** The bumped identity token and the entity's `shortId` (the pinged channel key
 *  the un-migrated provider still listens on). */
export interface IdentityCommit {
  version: number
  shortId: string
}

export async function commitIdentityWrite(
  executor: WriteExecutor,
  actor: Actor,
  { entityId, write }: EntityIdentityArgs,
  stamp: StampAccumulator
): Promise<Result<IdentityCommit, IdentityWriteRejection>> {
  // One authoritative observation of the target inside the attempt — ownership and
  // the guard's expected version both read it.
  const pc = await loadPlayerCharacterById(entityId, executor)
  if (!pc) return err("entity-not-found")
  if (pc.userId !== actor.userId) return err("unauthorized")

  // The patch is composed server-side from the descriptor (descriptor-in,
  // UNN-226) and touches exactly the one written column.
  const version = await advanceEntityAxisGuarded(
    executor,
    pc.entity,
    "identity",
    identityWritePatch(write),
    stamp
  )

  return ok({ version, shortId: pc.entity.shortId })
}
