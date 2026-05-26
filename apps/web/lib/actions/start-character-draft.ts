"use server"

import { revalidatePath } from "next/cache"
import { unauthorized } from "next/navigation"

import { auth } from "@/lib/auth"
import { startCharacterDraft } from "@/lib/db/start-character-draft"
import { ok, type Result } from "@/lib/game/result"

/**
 * Inserts a fresh `status: "draft"` character row for the signed-in caller
 * and returns its public `shortId` so the client can push to the first
 * movement (`/builder/{shortId}/{FIRST_STEP_SLUG}`). Each call creates a
 * new draft — the builder is intentionally multi-draft (a player exploring
 * two character concepts shouldn't have to throw one away to try the
 * other; the existing delete dialog handles cleanup).
 *
 * Revalidates `/` so the new draft card appears on My Characters as soon as
 * the navigation completes.
 */
export async function startCharacterDraftAction(): Promise<
  Result<{ shortId: string }, never>
> {
  const session = await auth()
  if (!session?.user?.id) unauthorized()

  const { shortId } = await startCharacterDraft(session.user.id)

  revalidatePath("/")

  return ok({ shortId })
}
