import { isNarrativelyLocked } from "@workspace/game-v2/archetypes/atlas"
import { err, ok, type Result } from "@workspace/result"

import { hiddenArchetypeKeysFor } from "@/domain/archetypes/restricted"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { getArchetype } from "@/domain/game-engine-v2"
import { loadNarrativeGate } from "@/domain/planner/load-narrative-gate"
import type { WriteExecutor } from "@/lib/db/client"
import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"

/**
 * The viewer-identity authorization for an Archetype rank-spend — the one entity
 * write whose legality depends on *who* the viewer is and the *campaign story*,
 * not just stored state. Shared by the registered entity mutation command and
 * combat's durable command so the
 * rule has one home: the pure Writer is catalog-only (it runs on the optimistic
 * client too), so this gate is the authority's responsibility.
 *
 * Since UNN-674 it is a **typed rejection**, not a `forbidden()` throw, and reads
 * the already-loaded PC + a supplied executor: it runs *inside* the transactional
 * handler so contention rerun re-evaluates it against current state and the
 * handler never throws framework control flow. The doors translate a rejection to
 * `forbidden()` at their boundary. A no-op for every write that is not
 * `archetypes/spendArchetypeRank`.
 */
export type ArchetypeGateRejection = "archetype-hidden" | "archetype-locked"

export async function refuseGatedArchetypeSpend(
  executor: WriteExecutor,
  email: string | null,
  pc: LoadedPlayerCharacter,
  write: EntityWrite
): Promise<Result<void, ArchetypeGateRejection>> {
  if (write.component !== "archetypes" || write.op !== "spendArchetypeRank") {
    return ok(undefined)
  }

  if (hiddenArchetypeKeysFor(email).includes(write.archetypeKey)) {
    return err("archetype-hidden")
  }

  return refuseNarrativelyLockedUnlock(executor, pc, write.archetypeKey)
}

/**
 * The narrative gate's write-side arm (UNN-581, D8): a placed character in a
 * gating-enabled campaign may not unlock an Archetype whose tier the story
 * hasn't opened. Resolves the gate through the same `loadNarrativeGate` +
 * `isNarrativelyLocked` the Atlas renders from, so what displays locked and what
 * refuses to unlock can't drift. Ranking up an **owned** Archetype stays legal —
 * acquisition is permanent; a bond regress never re-locks holdings. The common
 * paths (not placed / gating off) short-circuit after one read. Reads the
 * archetypes off the PC the handler already loaded (UNN-674), so no re-query.
 */
async function refuseNarrativelyLockedUnlock(
  executor: WriteExecutor,
  pc: LoadedPlayerCharacter,
  archetypeKey: string
): Promise<Result<void, "archetype-locked">> {
  if (!pc.campaignId) return ok(undefined)

  const archetypes = pc.entity.archetypes
  const owned = archetypes?.roster.some((entry) => entry.key === archetypeKey)
  if (owned) return ok(undefined)

  const gate = await loadNarrativeGate(
    {
      campaignId: pc.campaignId,
      originArchetypeKey: archetypes?.origin ?? null,
    },
    executor
  )
  if (gate === undefined) return ok(undefined)

  const target = getArchetype(archetypeKey)
  if (!target) return ok(undefined)

  const originLineage = archetypes?.origin
    ? (getArchetype(archetypes.origin)?.lineage ?? null)
    : null
  return isNarrativelyLocked(target, gate, originLineage)
    ? err("archetype-locked")
    : ok(undefined)
}
