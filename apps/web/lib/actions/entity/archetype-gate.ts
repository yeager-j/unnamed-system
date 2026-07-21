import { forbidden } from "next/navigation"

import { isNarrativelyLocked } from "@workspace/game-v2/archetypes/atlas"

import { hiddenArchetypeKeysFor } from "@/domain/archetypes/restricted"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { getArchetype } from "@/domain/game-engine-v2"
import { loadNarrativeGate } from "@/domain/planner/load-narrative-gate"
import { auth } from "@/lib/auth"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"

/**
 * The viewer-identity authorization for an Archetype rank-spend — the one entity
 * write whose legality depends on *who* the viewer is and the *campaign story*,
 * not just stored state. Shared by both entity-write doors (the legacy
 * `applyEntityWriteAction` and the Headcanon `applyEntityMutationAction`, UNN-673)
 * so the rule has one home: the pure Writer is catalog-only (it runs on the
 * optimistic client too), so this gate is the door's responsibility.
 *
 * A no-op for every write that is not `archetypes/spendArchetypeRank`. Trips
 * `forbidden()` (HTTP 403) when the target Archetype is hidden from the viewer's
 * Atlas allowlist or narratively locked for a placed character.
 */
export async function refuseGatedArchetypeSpend(
  entityId: string,
  write: EntityWrite
): Promise<void> {
  if (write.component !== "archetypes" || write.op !== "spendArchetypeRank") {
    return
  }

  const session = await auth()
  if (
    hiddenArchetypeKeysFor(session?.user?.email).includes(write.archetypeKey)
  ) {
    forbidden()
  }

  await refuseNarrativelyLockedUnlock(entityId, write.archetypeKey)
}

/**
 * The narrative gate's write-side arm (UNN-581, D8): a placed character in a
 * gating-enabled campaign may not unlock an Archetype whose tier the story
 * hasn't opened. Resolves the gate through the same `loadNarrativeGate` +
 * `isNarrativelyLocked` the Atlas renders from, so what displays locked and what
 * refuses to unlock can't drift. Ranking up an **owned** Archetype stays legal —
 * acquisition is permanent; a bond regress never re-locks holdings. The common
 * paths (not placed / gating off) short-circuit after two reads.
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
