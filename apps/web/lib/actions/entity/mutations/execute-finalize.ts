import { eq } from "drizzle-orm"

import { type MutationHandlerContext } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import {
  toEntityFinalizeRefusal,
  type EntityFinalizeArgs,
} from "@/domain/entity/commit/protocol"
import { buildFinalizePatch } from "@/domain/entity/finalize"
import { getArchetype, startingWeaponForLineage } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { loadPlayerCharacterById } from "@/lib/db/queries/load-player-character"
import { playerCharacter } from "@/lib/db/schema/player-character"

import { advanceEntityAxisGuarded } from "../version-guard"
import type {
  EntityMutationActor,
  EntityMutationRejection,
  EntityMutationTx,
} from "./types"

/** The `entity.finalize` authority handler (UNN-677). The draft precondition,
 * seeded components, identity-axis advance, subtype status flip, receipt, and
 * stamp all share the executor's retryable transaction. */
export async function executeFinalize({
  tx,
  args,
  actor,
  stamp,
}: MutationHandlerContext<
  EntityMutationTx,
  EntityFinalizeArgs,
  EntityMutationActor
>): Promise<Result<void, EntityMutationRejection>> {
  const pc = await loadPlayerCharacterById(args.entityId, tx)
  if (!pc) return err("entity-not-found")
  if (pc.userId !== actor.userId) return err("unauthorized")
  if (pc.status !== "draft") return err("entity-not-draft")

  const loaded = loadEntityRow(pc.entity)
  if (!loaded.ok) return err("entity-load-failed")

  const patch = buildFinalizePatch(pc.entity.name, loaded.value.components, {
    getArchetype,
    startingWeaponForLineage,
    newId: () => crypto.randomUUID(),
  })
  if (!patch.ok) return err(toEntityFinalizeRefusal(patch.error))

  const { status, ...entityPatch } = patch.value
  await advanceEntityAxisGuarded(tx, pc.entity, "identity", entityPatch, stamp)
  await tx
    .update(playerCharacter)
    .set({ status })
    .where(eq(playerCharacter.entityId, pc.entity.id))

  return ok(undefined)
}
