"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import {
  ApplyEntityWriteSchema,
  type ApplyEntityWriteError,
  type ApplyEntityWriteInput,
} from "./apply-entity-write.schema"
import { commitEntityWrite, type EntityCommit } from "./entity-row-store"

/**
 * The **entity door** Server Action (UNN-551; ADR §2.4) — a character surface's
 * provider dispatches a component write here. Parse the wire, then hand off to the
 * shared {@link commitEntityWrite}, which owns auth, the pure Writer, and the
 * guarded column commit. Branchless: a character route addresses a durable row by
 * construction, so there is no home fork here (that lives only inside an
 * encounter, on the combat door).
 *
 * No `revalidatePath` in S0: the guard's realtime ping already invalidates every
 * watcher, and the v2 character route this would revalidate arrives with the sheet
 * slice (S2) — that slice wires its revalidation when it lands.
 */
export async function applyEntityWriteAction(
  input: ApplyEntityWriteInput
): Promise<Result<EntityCommit, ApplyEntityWriteError>> {
  const parsed = ApplyEntityWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  return commitEntityWrite(
    parsed.data.entityId,
    parsed.data.write,
    parsed.data.expectedVersion
  )
}
