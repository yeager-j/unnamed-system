import { isNarrativelyLocked } from "@workspace/game-v2/archetypes/atlas"
import { err, ok, type Result } from "@workspace/result"

import { hiddenArchetypeKeysFor } from "@/domain/archetypes/restricted"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { getArchetype } from "@/domain/game-engine-v2"
import { loadNarrativeGate } from "@/domain/planner/load-narrative-gate"
import { auth } from "@/lib/auth"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"

/**
 * The viewer-identity gates on spending a Rank into a **new** Archetype,
 * decided once for both write doors (UNN-645; previously inline in the entity
 * door action): the per-user restricted-Archetype allowlist
 * (`hiddenArchetypeKeysFor` — the pure Writer is catalog-only and runs on the
 * optimistic client, so the identity gate must re-enforce at the door), and
 * the campaign narrative gate (UNN-581, D8 — a placed character may not
 * unlock a tier the story hasn't opened; ranking up an owned Archetype stays
 * legal).
 *
 * Returns `ok` for every write that isn't a `spendArchetypeRank` — callers
 * stay blind to which ops are gated. Result-shaped because the replica push
 * door records the refusal as the mutation's terminal outcome; the classic
 * door rethrows via `forbidden()`.
 */
export async function checkArchetypeUnlockGates(
  entityId: string,
  write: EntityWrite
): Promise<Result<void, "forbidden">> {
  if (write.component !== "archetypes" || write.op !== "spendArchetypeRank") {
    return ok(undefined)
  }

  const session = await auth()
  if (
    hiddenArchetypeKeysFor(session?.user?.email).includes(write.archetypeKey)
  ) {
    return err("forbidden")
  }

  return checkNarrativeUnlockGate(entityId, write.archetypeKey)
}

/**
 * The narrative gate's write-side arm (UNN-581, D8 — the same two-consumer
 * pattern as the restricted-Archetype gate above): resolves the gate through
 * the same `loadNarrativeGate` + `isNarrativelyLocked` the Atlas renders
 * from, so what displays locked and what refuses to unlock can't drift. The
 * common paths (not placed / gating off) short-circuit after two reads.
 */
async function checkNarrativeUnlockGate(
  entityId: string,
  archetypeKey: string
): Promise<Result<void, "forbidden">> {
  const character = await loadPlayerCharacterById(entityId)
  if (!character?.campaignId) return ok(undefined)

  const archetypes = character.entity.archetypes
  const owned = archetypes?.roster.some((entry) => entry.key === archetypeKey)
  if (owned) return ok(undefined)

  const gate = await loadNarrativeGate({
    campaignId: character.campaignId,
    originArchetypeKey: archetypes?.origin ?? null,
  })
  if (gate === undefined) return ok(undefined)

  const target = getArchetype(archetypeKey)
  if (!target) return ok(undefined)

  const originLineage = archetypes?.origin
    ? (getArchetype(archetypes.origin)?.lineage ?? null)
    : null
  return isNarrativelyLocked(target, gate, originLineage)
    ? err("forbidden")
    : ok(undefined)
}
