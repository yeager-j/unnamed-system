"use server"

import { forbidden } from "next/navigation"

import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { type Result } from "@workspace/result"

import { requireActor } from "@/lib/auth/actor"
import { db } from "@/lib/db/client"
import { publishCharacterPing } from "@/lib/realtime/publish"

import {
  ApplyEntityWriteSchema,
  type ApplyEntityWriteError,
  type ApplyEntityWriteInput,
} from "./apply-entity-write.schema"
import { isEntityWriteAuthRejection } from "./authorize-write"
import { commitEntityWrite, type EntityCommit } from "./entity-row-store"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"

/**
 * The legacy **entity door** Server Action (UNN-551; ADR §2.4) — a character
 * surface's provider dispatches a component write here. Since UNN-674 it routes
 * through the executor-neutral {@link commitEntityWrite} with the standalone `db`
 * executor: the Store owns authentication-derived authorization, the pure Writer,
 * and the server-authoritative guarded commit. The door owns only the post-commit
 * finalization the Store deliberately does not do — the realtime ping (relocated
 * out of the guard) and route revalidation — plus translating the Store's typed
 * outcomes to this door's contract.
 *
 * The wire still carries a now-vestigial `expectedVersion`; the Store reads the
 * version server-side and ignores the client token (its removal, with the client
 * provider cutover, is a later phase). A lost race surfaces as `"stale"` for the
 * client's existing one-shot retry; a contextual authorization refusal becomes a
 * `forbidden()` (403), preserving the pre-UNN-674 contract with no client change.
 */
export async function applyEntityWriteAction(
  input: ApplyEntityWriteInput
): Promise<Result<EntityCommit, ApplyEntityWriteError>> {
  const parsed = ApplyEntityWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const actor = await requireActor()
  const { entityId, write } = parsed.data
  const stamp = createStampAccumulator()

  let committed: Awaited<ReturnType<typeof commitEntityWrite>>
  try {
    committed = await commitEntityWrite(db, actor, { entityId, write }, stamp)
  } catch (error) {
    if (error instanceof MutationContentionError) {
      return { ok: false, error: "stale" }
    }
    throw error
  }

  if (!committed.ok) {
    if (isEntityWriteAuthRejection(committed.error)) forbidden()
    return { ok: false, error: committed.error }
  }

  // Post-acceptance finalization the Store leaves to its caller: ping other
  // watchers on the entity's channel, catch the optimistic base up on this route,
  // and revalidate the summary list only when a bumped field feeds it.
  publishCharacterPing(committed.value.shortId, "entity", {
    [committed.value.versionClass]: committed.value.version,
  })
  revalidateEntity(committed.value)
  if (write.component === "level" || write.component === "archetypes") {
    revalidateCharacterList()
  }

  return committed
}
