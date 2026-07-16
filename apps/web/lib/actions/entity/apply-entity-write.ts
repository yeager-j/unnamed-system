"use server"

import { forbidden } from "next/navigation"

import { isNarrativelyLocked } from "@workspace/game-v2/archetypes/atlas"
import { type Result } from "@workspace/game-v2/kernel/result"

import { hiddenArchetypeKeysFor } from "@/domain/archetypes/restricted"
import { getArchetype } from "@/domain/game-engine-v2"
import { loadNarrativeGate } from "@/domain/planner/load-narrative-gate"
import { auth } from "@/lib/auth"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"

import {
  ApplyEntityWriteSchema,
  type ApplyEntityWriteError,
  type ApplyEntityWriteInput,
} from "./apply-entity-write.schema"
import { commitEntityWrite, type EntityCommit } from "./entity-row-store"
import { revalidateCharacterList, revalidateEntity } from "./revalidate"

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
    await refuseNarrativelyLockedUnlock(
      parsed.data.entityId,
      write.archetypeKey
    )
  }

  const result = await commitEntityWrite(
    parsed.data.entityId,
    parsed.data.write,
    parsed.data.expectedVersion
  )

  if (result.ok) {
    revalidateEntity(result.value)
    if (write.component === "level" || write.component === "archetypes") {
      revalidateCharacterList()
    }
  }

  return result
}

/**
 * The narrative gate's write-side arm (UNN-581, D8 — the same two-consumer
 * pattern as the restricted-Archetype gate above): a placed character in a
 * gating-enabled campaign may not unlock an Archetype whose tier the story
 * hasn't opened. Resolves the gate through the same `loadNarrativeGate` +
 * `isNarrativelyLocked` the Atlas renders from, so what displays locked and
 * what refuses to unlock can't drift. Ranking up an **owned** Archetype stays
 * legal — acquisition is permanent; a bond regress never re-locks holdings.
 * The common paths (not placed / gating off) short-circuit after two reads.
 */
async function refuseNarrativelyLockedUnlock(
  entityId: string,
  archetypeKey: string
): Promise<void> {
  const character = await loadPlayerCharacterById(entityId)
  if (!character?.campaignId) return

  const archetypes = character.entity.archetypes
  const owned = archetypes?.roster.some((entry) => entry.key === archetypeKey)
  if (owned) return

  const gate = await loadNarrativeGate({
    campaignId: character.campaignId,
    originArchetypeKey: archetypes?.origin ?? null,
  })
  if (gate === undefined) return

  const target = getArchetype(archetypeKey)
  if (!target) return

  const originLineage = archetypes?.origin
    ? (getArchetype(archetypes.origin)?.lineage ?? null)
    : null
  if (isNarrativelyLocked(target, gate, originLineage)) forbidden()
}
