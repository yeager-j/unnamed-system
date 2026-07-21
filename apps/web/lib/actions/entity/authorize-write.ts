import { forbidden } from "next/navigation"

import { err, type Result } from "@workspace/result"

import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { ENTITY_WRITERS } from "@/domain/entity/commit/writers"
import type { Actor } from "@/lib/auth/actor"
import { isOwnerOrCampaignDM } from "@/lib/auth/campaign-access"
import { db, type WriteExecutor } from "@/lib/db/client"
import {
  loadPlayerCharacterById,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"

import {
  refuseGatedArchetypeSpend,
  type ArchetypeGateRejection,
} from "./archetype-gate"

/**
 * The single home (UNN-674) for "may this actor commit this entity write?" — the
 * contextual authorization the transactional handler reruns inside every attempt
 * and the doors pre-check as a cheap fail-closed guard. Two posture arms decided
 * by the Writer's class (CH4/UNN-556): a `vitals`-class write admits the owner
 * *or* the campaign DM (the console's sanctioned HP/SP access); every other class
 * is strict-owner, so a DM cannot rewrite a placed player's Origin, Virtues, or
 * narrative — plus the shared restricted-Archetype / narrative-lock gate. The
 * write class is derived from the registry, never taken from the wire.
 *
 * A **typed rejection**, not a `forbidden()` throw: it runs inside the handler's
 * transaction (so it must not throw framework control flow, and contention rerun
 * re-evaluates it against current state). The door boundary translates a
 * rejection to `forbidden()`.
 */
export type EntityWriteAuthRejection = "unauthorized" | ArchetypeGateRejection

const AUTH_REJECTIONS: ReadonlySet<string> = new Set<EntityWriteAuthRejection>([
  "unauthorized",
  "archetype-hidden",
  "archetype-locked",
])

/** Whether a rejection is an authorization refusal a door should turn into a
 *  `forbidden()` (HTTP 403) rather than a returned domain error. */
export function isEntityWriteAuthRejection(
  rejection: string
): rejection is EntityWriteAuthRejection {
  return AUTH_REJECTIONS.has(rejection)
}

export async function authorizeEntityWrite(
  executor: WriteExecutor,
  actor: Actor,
  pc: LoadedPlayerCharacter,
  write: EntityWrite
): Promise<Result<void, EntityWriteAuthRejection>> {
  const { durableClass } = ENTITY_WRITERS[write.component]

  const ownershipOk =
    durableClass === "vitals"
      ? await isOwnerOrCampaignDM(actor.userId, pc, executor)
      : pc.userId === actor.userId
  if (!ownershipOk) return err("unauthorized")

  return refuseGatedArchetypeSpend(actor.email, pc, write)
}

/**
 * The door's throwing pre-check: load the target and run {@link
 * authorizeEntityWrite} against the standalone `db`, tripping `forbidden()` on any
 * refusal. Fails closed *before* the executor claims a receipt or takes a lock, so
 * an unauthorized caller never writes a receipt — the in-handler check remains the
 * authority under contention. A missing PC is a 403, not an existence leak.
 */
export async function requireEntityWriteAuthorized(
  actor: Actor,
  entityId: string,
  write: EntityWrite
): Promise<void> {
  const pc = await loadPlayerCharacterById(entityId)
  if (!pc) forbidden()

  const authorized = await authorizeEntityWrite(db, actor, pc, write)
  if (!authorized.ok) forbidden()
}
