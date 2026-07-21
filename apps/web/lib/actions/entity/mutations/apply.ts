"use server"

import { forbidden } from "next/navigation"

import { requireActor } from "@/lib/auth/actor"

import {
  isEntityWriteAuthRejection,
  requireEntityWriteAuthorized,
} from "../authorize-write"
import { revalidateCharacterList } from "../revalidate"
import { parseEntityWriteTarget } from "./authorize"
import { executeEntityMutation } from "./executor"

/**
 * The Headcanon **entity door** (UNN-673/UNN-674) — the app-owned Server Action a
 * character surface dispatches an `entity.write` invocation through. Its jobs are
 * authentication, a cheap fail-closed authorization pre-check, and *unrelated*
 * revalidation:
 *
 * - `requireActor()` derives the trusted actor (authentication);
 * - `requireEntityWriteAuthorized` runs the same contextual authorization the
 *   handler reruns, tripping `forbidden()` *before* the executor claims a receipt
 *   or takes a lock, so an unauthorized caller writes no receipt;
 * - the executor owns dedup, the transactional handler (which reruns the
 *   authorization inside its attempt), contention retry, axis cache-tag expiry,
 *   route refresh, and axis invalidation publication;
 * - a rare race where the handler's in-transaction authorization refuses after the
 *   pre-check passed surfaces as a rejected outcome — translated back to
 *   `forbidden()` so the 403 contract holds; and
 * - the door adds only the character-list revalidation, an *additional* projection
 *   (the summary list) that does not observe the mutated entity axes.
 *
 * The wire carries only `{ protocol, mutationId, invocation: { entityId, write } }`
 * — no expected revision, lane, axis, actor, or storage-home. The actor is derived
 * here; the axis, class, and storage home are derived by the authority.
 */
export async function applyEntityMutationAction(envelope: unknown) {
  const actor = await requireActor()

  const target = parseEntityWriteTarget(envelope)
  if (target) {
    await requireEntityWriteAuthorized(actor, target.entityId, target.write)
  }

  const outcome = await executeEntityMutation(envelope, actor)

  // A race can let the handler's authoritative in-transaction authorization refuse
  // after the door's pre-check passed (e.g. placement changed). Preserve the 403.
  if (
    outcome.ok &&
    outcome.value.kind === "rejected" &&
    isEntityWriteAuthRejection(outcome.value.error)
  ) {
    forbidden()
  }

  // A level or Archetype change alters the My Characters summary, which does not
  // observe the entity's own axes — so the executor's axis finalization does not
  // cover it. Reuse the same helper the legacy door does (it revalidates `/`,
  // where the list renders). Everything else is reconciled by the executor.
  if (
    outcome.ok &&
    (target?.write.component === "level" ||
      target?.write.component === "archetypes")
  ) {
    revalidateCharacterList()
  }

  return outcome
}
