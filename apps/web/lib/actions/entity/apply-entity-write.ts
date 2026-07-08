"use server"

import { forbidden } from "next/navigation"

import { type Result } from "@workspace/game-v2/kernel/result"

import { hiddenArchetypeKeysFor } from "@/lib/archetypes/restricted"
import { auth } from "@/lib/auth"

import {
  ApplyEntityWriteSchema,
  type ApplyEntityWriteError,
  type ApplyEntityWriteInput,
} from "./apply-entity-write.schema"
import { commitEntityWrite, type EntityCommit } from "./entity-row-store"
import { revalidateEntity } from "./revalidate"

/**
 * The **entity door** Server Action (UNN-551; ADR §2.4) — a character surface's
 * provider dispatches a component write here. Parse the wire, then hand off to the
 * shared {@link commitEntityWrite}, which owns auth, the pure Writer, and the
 * guarded column commit. Branchless: a character route addresses a durable row by
 * construction, so there is no home fork here (that lives only inside an
 * encounter, on the combat door).
 *
 * Revalidates the entity's app routes on success (UNN-556 — the builder is the
 * first character surface on this door): the optimistic frame's base must catch
 * up when the transition settles, or the UI would snap back to the pre-write
 * state. The encounter door deliberately does not flow through here — combat's
 * invalidation is the guard's realtime ping.
 */
export async function applyEntityWriteAction(
  input: ApplyEntityWriteInput
): Promise<Result<EntityCommit, ApplyEntityWriteError>> {
  const parsed = ApplyEntityWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  // Spending a Rank on a restricted Archetype is the one write whose legality
  // depends on the viewer's identity, not just the stored state: the pure
  // Writer is catalog-only (it runs on the optimistic client too), so the
  // per-user allowlist gate that keeps a gated Archetype out of a non-
  // allowlisted viewer's Atlas is re-enforced here at the door.
  const { write } = parsed.data
  if (write.component === "archetypes" && write.op === "spendArchetypeRank") {
    const session = await auth()
    if (
      hiddenArchetypeKeysFor(session?.user?.email).includes(write.archetypeKey)
    ) {
      forbidden()
    }
  }

  const result = await commitEntityWrite(
    parsed.data.entityId,
    parsed.data.write,
    parsed.data.expectedVersion
  )

  if (result.ok) revalidateEntity(result.value)

  return result
}
