"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import { characters } from "@/lib/db/schema/character"
import { entity } from "@/lib/db/schema/entity"

import {
  DeleteEntitySchema,
  type DeleteEntityError,
  type DeleteEntityInput,
} from "./delete.schema"

/**
 * Permanently deletes an entity (UNN-556 — the `deleteCharacterAction` twin).
 * Same confirmation contract: named rows require the typed name to match;
 * unnamed drafts accept a missing/empty confirmation. Refuses with
 * `live-encounter-lock` when the entity is a combatant in its campaign's live
 * encounter (UNN-330 — the lock query already reads `entity`).
 *
 * The delete removes the `entity` row **and** the same-id v1 `characters` row
 * in one transaction: seed/e2e characters are dual-minted with a shared id
 * (S0), so deleting only the entity would leave a live orphan at the v1
 * `/c/{shortId}` route. A builder-born entity has no v1 twin — the second
 * DELETE simply matches nothing. Deliberately not version-guarded (v1 parity:
 * the typed name is the intent gate).
 */
export async function deleteEntityAction(
  input: DeleteEntityInput
): Promise<Result<void, DeleteEntityError>> {
  const parsed = DeleteEntitySchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)

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

  const deleted = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(entity)
      .where(eq(entity.id, row.id))
      .returning({ id: entity.id })
    await tx.delete(characters).where(eq(characters.id, row.id))
    return removed
  })

  if (deleted.length === 0) return err("entity-not-found")

  revalidatePath("/")
  revalidatePath(`/c/${row.shortId}`)

  return ok(undefined)
}
