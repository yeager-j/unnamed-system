"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  claimDungeonSlot,
  setDungeonSlotResolved,
  unclaimDungeonSlot,
} from "@/lib/db/writes/campaign-slot-dungeon"

import {
  ClaimDungeonSlotSchema,
  SetDungeonSlotResolvedSchema,
  UnclaimDungeonSlotSchema,
  type ClaimDungeonSlotInput,
  type DungeonClaimActionError,
  type SetDungeonSlotResolvedInput,
  type UnclaimDungeonSlotInput,
} from "./dungeon-claim.schema"
import { revalidateCampaignClock } from "./revalidate"

/**
 * Dungeon slot claims (UNN-577, tech-design D9 / PRD FR-5): "Run a dungeon"
 * claims a slot the way a scheduled beat does — the claim row *is* the
 * slot's dungeon kind. Coupling stays one-directional and manual: the
 * dungeon console never touches the clock; resolving here never touches the
 * dungeon's own `status`. The dungeon belonging to the gated campaign, the
 * frozen-past rule, and beat mutual exclusion are the write layer's guards.
 */

export async function claimDungeonSlotAction(
  input: ClaimDungeonSlotInput
): Promise<Result<void, DungeonClaimActionError>> {
  const parsed = ClaimDungeonSlotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const claimed = await claimDungeonSlot({
    campaignId: campaign.id,
    slotId: parsed.data.slotId,
    dungeonId: parsed.data.dungeonId,
  })
  if (claimed.ok) revalidateCampaignClock(campaign)
  return claimed
}

/** Remove (FR-5): unclaim — the slot reverts to downtime. */
export async function unclaimDungeonSlotAction(
  input: UnclaimDungeonSlotInput
): Promise<Result<void, DungeonClaimActionError>> {
  const parsed = UnclaimDungeonSlotSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const unclaimed = await unclaimDungeonSlot({
    campaignId: campaign.id,
    slotId: parsed.data.slotId,
  })
  if (unclaimed.ok) revalidateCampaignClock(campaign)
  return unclaimed
}

/** Mark resolved / Reopen on the claim (FR-5). LWW. */
export async function setDungeonSlotResolvedAction(
  input: SetDungeonSlotResolvedInput
): Promise<Result<void, DungeonClaimActionError>> {
  const parsed = SetDungeonSlotResolvedSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const set = await setDungeonSlotResolved({
    campaignId: campaign.id,
    slotId: parsed.data.slotId,
    resolved: parsed.data.resolved,
  })
  if (set.ok) revalidateCampaignClock(campaign)
  return set
}
