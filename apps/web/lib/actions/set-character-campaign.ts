"use server"

import { revalidatePath } from "next/cache"
import { forbidden } from "next/navigation"

import { requireOwner } from "@/lib/auth/viewer-role"
import {
  isCampaignMember,
  loadCampaignRowById,
} from "@/lib/db/queries/load-campaign"
import { setCharacterCampaign } from "@/lib/db/writes/campaign-placement"
import { ok, type Result } from "@/lib/result"

import {
  SetCharacterCampaignSchema,
  type SetCharacterCampaignError,
  type SetCharacterCampaignInput,
} from "./set-character-campaign.schema"

/**
 * Places, moves, or unplaces a character into/out of a campaign by setting
 * `characters.campaignId` (UNN-328) — the owner action that consents to the DM's
 * in-combat vitals writes (ADR Decision 9).
 *
 * Two gates:
 *  - `requireOwner` — only the character's owner may set its `campaignId`; the DM
 *    has no action that touches another character's placement.
 *  - **target membership** — when placing/moving (non-null `campaignId`), the
 *    owner must be a member or the DM of the destination campaign, else
 *    `forbidden()`. Otherwise a player could place into a campaign they don't
 *    belong to and hand that DM their vitals.
 *
 * The single-campaign move and the live-encounter lock are enforced in
 * {@link setCharacterCampaign}; a `live-encounter-lock` surfaces to the client so
 * it can explain why the move was refused.
 */
export async function setCharacterCampaignAction(
  input: SetCharacterCampaignInput
): Promise<Result<void, SetCharacterCampaignError>> {
  const parsed = SetCharacterCampaignSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const character = await requireOwner(parsed.data.characterId)
  const { campaignId } = parsed.data

  if (campaignId !== null) {
    const target = await loadCampaignRowById(campaignId)
    if (!target) forbidden()
    const ownerIsInCampaign =
      target.dmUserId === character.ownerId ||
      (await isCampaignMember(campaignId, character.ownerId))
    if (!ownerIsInCampaign) forbidden()
  }

  const result = await setCharacterCampaign(
    character.id,
    character.campaignId,
    campaignId
  )
  if (!result.ok) return result

  revalidatePath("/campaigns", "layout")
  return ok(undefined)
}
