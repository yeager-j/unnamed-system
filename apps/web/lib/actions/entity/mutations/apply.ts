"use server"

import { requireActor } from "@/lib/auth/actor"

import { revalidateCharacterList } from "../revalidate"
import { authorizeEntityWrite, parseEntityWriteTarget } from "./authorize"
import { executeEntityMutation } from "./executor"

/**
 * The Headcanon **entity door** (UNN-673, AC #5) — the app-owned Server Action a
 * character surface dispatches an `entity.write` invocation through. Its only
 * jobs are authentication, authorization, and *unrelated* revalidation:
 *
 * - `requireActor()` derives the trusted actor (authentication);
 * - `authorizeEntityWrite` runs the per-class ownership + Archetype gates before
 *   the executor touches storage (a target the executor would reject anyway is
 *   left for it to reject, so no valid write bypasses the gate);
 * - the executor owns dedup, the transactional handler, contention retry, axis
 *   cache-tag expiry, route refresh, and axis invalidation publication; and
 * - the door adds only the character-list revalidation, an *additional*
 *   projection (the summary list) that does not observe the mutated entity axes.
 *
 * The wire carries only `{ protocol, mutationId, invocation: { entityId, write } }`
 * — no expected revision, lane, axis, actor, or storage-home. The actor is
 * derived here; the axis, class, and storage home are derived by the authority.
 */
export async function applyEntityMutationAction(envelope: unknown) {
  const actor = await requireActor()

  const target = parseEntityWriteTarget(envelope)
  if (target) await authorizeEntityWrite(target)

  const outcome = await executeEntityMutation(envelope, actor)

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
