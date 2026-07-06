"use server"

import { revalidatePath } from "next/cache"
import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { entity } from "@/lib/db/schema/entity"
import { insertWithShortId } from "@/lib/db/short-id"
import { draftEntityComponents } from "@/lib/entity/draft"

/**
 * Mints a fresh builder draft as an `entity` row (UNN-556 — a draft is an
 * entity row from step one, ADR §2.8) for the signed-in caller and returns its
 * public `shortId` so the client can push to the first movement. Name seeds
 * empty per ADR-002's "name-last" decision; multiple drafts per user is
 * intentional (the delete dialog handles cleanup). Revalidates `/` so the new
 * draft card appears on My Characters as soon as the navigation completes.
 */
export async function startEntityDraftAction(): Promise<
  Result<{ shortId: string }, never>
> {
  const session = await auth()
  const ownerId = session?.user?.id
  if (!ownerId) unauthorized()

  const { shortId } = await insertWithShortId(async (candidate) => {
    await db.insert(entity).values({
      ownerId,
      shortId: candidate,
      kind: "pc",
      status: "draft",
      builderStep: 0,
      name: "",
      ...draftEntityComponents(),
    })
    return { shortId: candidate }
  })

  revalidatePath("/")

  return ok({ shortId })
}
