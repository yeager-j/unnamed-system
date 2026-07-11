"use server"

import { revalidatePath } from "next/cache"
import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { draftEntityComponents } from "@/domain/entity/draft"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Mints a fresh builder draft as an `entity` row **plus its `playerCharacter`
 * subtype row** (UNN-556 — a draft is an entity row from step one, ADR §2.8; the
 * subtype split is R3 — UNN-573) for the signed-in caller and returns its public
 * `shortId` so the client can push to the first movement. The supertype+subtype
 * pair mints in one transaction (the one-subtype invariant) and shares the entity
 * id. Name seeds empty per ADR-002's "name-last" decision; multiple drafts per user
 * is intentional (the delete dialog handles cleanup). Revalidates `/` so the new
 * draft card appears on My Characters as soon as the navigation completes.
 */
export async function startEntityDraftAction(): Promise<
  Result<{ shortId: string }, never>
> {
  const session = await auth()
  const ownerId = session?.user?.id
  if (!ownerId) unauthorized()

  const { shortId } = await insertWithShortId(async (candidate) => {
    await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(entity)
        .values({
          shortId: candidate,
          name: "",
          ...draftEntityComponents(),
        })
        .returning({ id: entity.id })

      await tx.insert(playerCharacter).values({
        entityId: inserted!.id,
        userId: ownerId,
        status: "draft",
        builderStep: 0,
      })
    })
    return { shortId: candidate }
  })

  revalidatePath("/")

  return ok({ shortId })
}
