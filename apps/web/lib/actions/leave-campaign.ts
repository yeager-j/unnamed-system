"use server"

import { revalidatePath } from "next/cache"
import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/result"

import { auth } from "@/lib/auth"
import { removeCampaignMember } from "@/lib/db/writes/campaign"

import {
  LeaveCampaignSchema,
  type LeaveCampaignError,
  type LeaveCampaignInput,
} from "./leave-campaign.schema"

/**
 * A player leaves a campaign (UNN-330) — removes their own `campaignUsers` row
 * and unplaces their characters, via the shared {@link removeCampaignMember}
 * transaction (so leave and kick behave identically; leave just targets the
 * caller). Auth is "must be signed in"; the member removes *themselves*, so no
 * `requireCampaignDM`. Refuses with `live-encounter-lock` when one of their
 * characters is a live combatant. The client redirects to `/campaigns` on
 * success; revalidating it drops the campaign from the viewer's "Playing in".
 */
export async function leaveCampaignAction(
  input: LeaveCampaignInput
): Promise<Result<void, LeaveCampaignError>> {
  const parsed = LeaveCampaignSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const session = await auth()
  if (!session?.user?.id) unauthorized()

  const result = await removeCampaignMember(
    parsed.data.campaignId,
    session.user.id
  )
  if (!result.ok) return result

  revalidatePath("/campaigns")
  return ok(undefined)
}
