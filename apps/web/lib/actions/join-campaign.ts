"use server"

import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"
import { loadCampaignByJoinToken } from "@/lib/db/queries/load-campaign"
import { addCampaignMember } from "@/lib/db/writes/campaign"

/**
 * Adds the signed-in viewer to the campaign behind `joinToken` (UNN-327), then
 * lands them on the campaign page so they can place a character right away
 * (UNN-328). Bound to the join page's "Join campaign" `<form>` via
 * `.bind(null, joinToken)`, so the trailing `_formData` is the form payload we
 * ignore.
 *
 * The action gates on the **token**, never a client-supplied campaign id: it
 * re-loads the campaign server-side so knowing an internal id can't be used to
 * self-join past the secret. A signed-out caller is bounced back through the
 * join page (which renders the sign-in prompt); an unknown/rotated token bounces
 * there too (the page shows the "link no longer valid" state). The DM is never
 * written as a member row (but still lands on the campaign). The insert is
 * idempotent ({@link addCampaignMember}), so re-joining is a harmless no-op that
 * still redirects.
 */
export async function joinCampaignAction(
  joinToken: string,
  _formData?: FormData
): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) redirect(`/join/${joinToken}`)

  const campaign = await loadCampaignByJoinToken(joinToken)
  if (!campaign) redirect(`/join/${joinToken}`)

  if (campaign.dmUserId !== session.user.id) {
    await addCampaignMember(campaign.id, session.user.id)
  }

  redirect(`/campaigns/${campaign.shortId}`)
}
