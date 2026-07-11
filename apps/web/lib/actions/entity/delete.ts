"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import { entity } from "@/lib/db/schema/entity"
import { characterPath } from "@/lib/paths"

import {
  DeleteEntitySchema,
  type DeleteEntityError,
  type DeleteEntityInput,
} from "./delete.schema"

/**
 * Soft-deletes an entity (UNN-556 — the `deleteCharacterAction` twin; flipped to
 * a tombstone in UNN-571/R1). Same confirmation contract: named rows require the
 * typed name to match; unnamed drafts accept a missing/empty confirmation.
 * Refuses with `live-encounter-lock` when the entity is a combatant in its
 * campaign's live encounter (UNN-330 — the lock query reads the PC subtype); that gate
 * is what lets the combat-adjacent reads resolve pinned ids `deletedAt`-blind
 * (see `schema/entity.ts`), since a durable combatant can never become a
 * tombstone while its fight is live.
 *
 * The flip is `SET deletedAt = now()`, not `DELETE`: the row persists so
 * history survives its subject (D4) and a future restore surface is cheap. The
 * discovery/identity reads gain a `deletedAt IS NULL` conjunct, so no list,
 * roster, or by-`shortId` load surfaces the tombstone and its public URL 404s.
 *
 * Deliberately not version-guarded (v1 parity: the typed name is the intent
 * gate). Idempotent: re-deleting an already-tombstoned row simply re-stamps
 * `deletedAt`.
 */
export async function deleteEntityAction(
  input: DeleteEntityInput
): Promise<Result<void, DeleteEntityError>> {
  const parsed = DeleteEntitySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { entity: row } = await requireEntityOwner(parsed.data.entityId)

  const typed = parsed.data.confirmationName?.trim() ?? ""
  const rowName = row.name.trim()

  if (rowName.length === 0) {
    if (typed.length !== 0) return err("name-mismatch")
  } else {
    if (typed !== rowName) return err("name-mismatch")
  }

  if (await isCharacterLiveEncounterCombatant(row.id)) {
    return err("live-encounter-lock")
  }

  const deleted = await db
    .update(entity)
    .set({ deletedAt: new Date() })
    .where(eq(entity.id, row.id))
    .returning({ id: entity.id })

  if (deleted.length === 0) return err("entity-not-found")

  revalidatePath("/")
  revalidatePath(characterPath(row.shortId))

  return ok(undefined)
}
