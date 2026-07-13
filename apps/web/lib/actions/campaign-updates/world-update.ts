"use server"

import { err, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { validateParticipantRefs } from "@/lib/db/queries/load-participants"
import { authorWorldUpdate } from "@/lib/db/writes/campaign-updates"

import { revalidateCampaignUpdates } from "./revalidate"
import {
  AuthorWorldUpdateSchema,
  type AuthorWorldUpdateError,
  type AuthorWorldUpdateInput,
} from "./world-update.schema"

/**
 * Authors a **world update** from an entity page (UNN-579; phase 7 mounts the
 * same action on Day-End and the Chronicle): stamped on the clock's
 * `currentDay`, primaried on the page's entity. Primary + concerns pass the
 * §5 boundary check before the row lands.
 */
export async function authorWorldUpdateAction(
  input: AuthorWorldUpdateInput
): Promise<Result<{ updateId: string }, AuthorWorldUpdateError>> {
  const parsed = AuthorWorldUpdateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const refs = await validateParticipantRefs(campaign.id, [
    ...(parsed.data.primary === null ? [] : [parsed.data.primary]),
    ...parsed.data.concerns,
  ])
  if (!refs.ok) return err("invalid-ref")

  const result = await authorWorldUpdate({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignUpdates(campaign)
  return result
}
