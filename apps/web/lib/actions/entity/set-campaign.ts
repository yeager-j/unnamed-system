"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { forbidden } from "next/navigation"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import {
  isCampaignMember,
  loadCampaignRowById,
} from "@/lib/db/queries/load-campaign"
import { entity } from "@/lib/db/schema/entity"

import {
  SetEntityCampaignSchema,
  type SetEntityCampaignError,
  type SetEntityCampaignInput,
} from "./set-campaign.schema"

/**
 * Places, moves, or unplaces an entity into/out of a campaign by setting
 * `entity.campaignId` (UNN-556, repointing UNN-328's v1 placement) — the owner
 * action that consents to the DM's in-combat vitals writes. This is the column
 * the entity auth gate (`requireOwnerOrCampaignDMForEntity`) and the
 * encounter-lock queries already read, so placement and write access can no
 * longer disagree.
 *
 * Two gates (v1 parity):
 *  - `requireEntityOwner` — only the owner may set placement; the DM has no
 *    action that touches another character's placement.
 *  - **target membership** — when placing/moving (non-null `campaignId`), the
 *    owner must be a member or the DM of the destination campaign, else
 *    `forbidden()`.
 *
 * The move is one statement (unplace-old + place-new atomically). Leaving a
 * campaign is refused with `live-encounter-lock` while the entity is a
 * combatant in that campaign's live encounter (UNN-330) — unplacing would
 * revoke the DM's mid-fight vitals access. Deliberately unguarded by a version
 * token (v1 parity).
 */
export async function setEntityCampaignAction(
  input: SetEntityCampaignInput
): Promise<Result<void, SetEntityCampaignError>> {
  const parsed = SetEntityCampaignSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const row = await requireEntityOwner(parsed.data.entityId)
  const { campaignId } = parsed.data

  if (campaignId !== null) {
    const target = await loadCampaignRowById(campaignId)
    if (!target) forbidden()
    const ownerIsInCampaign =
      target.dmUserId === row.ownerId ||
      (await isCampaignMember(campaignId, row.ownerId))
    if (!ownerIsInCampaign) forbidden()
  }

  const leavingCampaign =
    row.campaignId !== null && row.campaignId !== campaignId
  if (leavingCampaign && (await isCharacterLiveEncounterCombatant(row.id))) {
    return err("live-encounter-lock")
  }

  const updated = await db
    .update(entity)
    .set({ campaignId })
    .where(eq(entity.id, row.id))
    .returning({ id: entity.id })

  if (updated.length === 0) return err("entity-not-found")

  revalidatePath("/campaigns", "layout")
  return ok(undefined)
}
