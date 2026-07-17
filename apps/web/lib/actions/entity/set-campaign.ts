"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { forbidden } from "next/navigation"

import { err, ok, type Result } from "@workspace/result"

import { requireEntityOwner } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { isCharacterLiveEncounterCombatant } from "@/lib/db/queries/encounter-lock"
import {
  isCampaignMember,
  loadCampaignRowById,
} from "@/lib/db/queries/load-campaign"
import { playerCharacter } from "@/lib/db/schema/player-character"

import {
  SetEntityCampaignSchema,
  type SetEntityCampaignError,
  type SetEntityCampaignInput,
} from "./set-campaign.schema"

/**
 * Places, moves, or unplaces a player character into/out of a campaign by setting
 * `playerCharacter.campaignId` (UNN-556; the placement column moved to the PC door
 * in R3 — UNN-573) — the owner action that consents to the DM's in-combat vitals
 * writes. This is the column the entity auth gate
 * (`requireOwnerOrCampaignDMForEntity`) and the encounter-lock queries already
 * read off the subtype, so placement and write access can no longer disagree.
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

  const pc = await requireEntityOwner(parsed.data.entityId)
  const { campaignId } = parsed.data

  if (campaignId !== null) {
    const target = await loadCampaignRowById(campaignId)
    if (!target) forbidden()
    const ownerIsInCampaign =
      target.dmUserId === pc.userId ||
      (await isCampaignMember(campaignId, pc.userId))
    if (!ownerIsInCampaign) forbidden()
  }

  const leavingCampaign = pc.campaignId !== null && pc.campaignId !== campaignId
  if (
    leavingCampaign &&
    (await isCharacterLiveEncounterCombatant(pc.entity.id))
  ) {
    return err("live-encounter-lock")
  }

  const updated = await db
    .update(playerCharacter)
    .set({ campaignId })
    .where(eq(playerCharacter.entityId, pc.entity.id))
    .returning({ id: playerCharacter.entityId })

  if (updated.length === 0) return err("entity-not-found")

  revalidatePath("/campaigns", "layout")
  return ok(undefined)
}
