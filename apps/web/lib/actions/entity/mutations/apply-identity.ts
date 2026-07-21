"use server"

import { randomUUID } from "node:crypto"
import { forbidden } from "next/navigation"

import { err, ok, type Result } from "@workspace/result"

import {
  entityIdentity,
  entityIdentityArgs,
  entityProtocol,
} from "@/domain/entity/commit/protocol"
import { requireActor } from "@/lib/auth/actor"
import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { entityIdentityAxis } from "@/lib/db/axes"
import { publishCharacterPing } from "@/lib/realtime/publish"

import { isEntityWriteAuthRejection } from "../authorize-write"
import { revalidateCharacterList } from "../revalidate"
import type { ApplyIdentityWriteError } from "./apply-identity.schema"
import { executeEntityMutation } from "./executor"

/**
 * The Headcanon **identity door** (UNN-675) — the Server Action a character
 * surface's name, pronouns, notes, and portrait controls dispatch through. It
 * replaces the four focused column actions, so no user-facing `identity` write
 * bypasses the axis protocol any more: every one of them now takes a receipt,
 * expires the `entity/{id}/identity` cache tag, and publishes that axis's
 * invalidation, because the executor owns all three.
 *
 * Its jobs are authentication, a cheap fail-closed ownership pre-check, and the
 * projections the executor's axis finalization does not cover:
 *
 * - `requireActor()` derives the trusted actor, `requireEntityOwner` trips
 *   `forbidden()` before the executor claims a receipt or takes a lock (the
 *   handler reruns the same ownership check inside its transaction, which stays
 *   the authority under contention);
 * - `revalidateCharacterList()` for name and portrait, which feed the My
 *   Characters summary card — a projection that does not observe the entity axes;
 *   and
 * - the **legacy ping bridge**: the mounted provider still reconciles through
 *   `character:{shortId}` pings, not axis invalidations, so the door keeps
 *   publishing one. It is deleted with the P2d provider cutover (UNN-676), when
 *   the predicted root subscribes to the axis directly.
 *
 * **The mutation id is minted here, not by the caller** — also transitional. Until
 * P2d the client has no predicted root and therefore no `mutate` to allocate a
 * durable id, so a redelivered request would claim a fresh receipt instead of
 * recovering the recorded outcome. That costs nothing today: these are
 * last-writer-wins column sets with no client retry, and the debounce dispatches
 * once per settled edit. P2d moves allocation to the caller and makes redelivery
 * effectively-once.
 */
export async function applyIdentityWriteAction(
  input: unknown
): Promise<Result<{ version: number }, ApplyIdentityWriteError>> {
  const parsed = entityIdentityArgs.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const actor = await requireActor()
  const { entityId, write } = parsed.data
  const { entity: row } = await requireEntityOwner(entityId)

  const outcome = await executeEntityMutation(
    {
      protocol: entityProtocol.id,
      mutationId: randomUUID(),
      invocation: entityIdentity(parsed.data),
    },
    actor
  )

  if (!outcome.ok) {
    return err(
      outcome.error.code === "contention" ? "contention" : "invalid-input"
    )
  }

  if (outcome.value.kind === "rejected") {
    // A race can let the handler's in-transaction ownership check refuse after the
    // door's pre-check passed (a transfer landing between them). Preserve the 403.
    if (isEntityWriteAuthRejection(outcome.value.error)) forbidden()
    return err("entity-not-found")
  }

  const version = outcome.value.stamp.revisions[entityIdentityAxis(entityId)]
  if (version === undefined) {
    // An accepted identity write always stamps its axis; its absence would mean
    // the executor could not have expired the tag or published the invalidation.
    throw new Error(
      `entity.identity accepted without stamping the identity axis of ${entityId}`
    )
  }

  publishCharacterPing(row.shortId, "entity", { identity: version })
  if (write.field === "name" || write.field === "portraitUrl") {
    revalidateCharacterList()
  }

  return ok({ version })
}
