"use server"

import { revalidatePath } from "next/cache"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { rotateJoinToken } from "@/lib/db/writes/campaign"
import { campaignPath } from "@/lib/paths"

import {
  RotateJoinTokenSchema,
  type RotateJoinTokenError,
  type RotateJoinTokenInput,
} from "./rotate-join-token.schema"

/**
 * Rotates a campaign's `joinToken` (DM-only), invalidating the previous
 * `/join/{token}` link immediately — the "stranger with the link" mitigation
 * (ADR Decision 9). `requireCampaignDM` gates the write and hands back the row so
 * we can revalidate the manage page. Returns the new token for the optimistic UI.
 */
export async function rotateJoinTokenAction(
  input: RotateJoinTokenInput
): Promise<Result<{ joinToken: string }, RotateJoinTokenError>> {
  const parsed = RotateJoinTokenSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)
  const joinToken = await rotateJoinToken(campaign.id)

  // Layout scope: the invite-link card relocated to /manage (UNN-574), and the
  // card renders the token from server props — a page-scoped revalidate of the
  // root would leave the revoked link on screen there.
  revalidatePath(campaignPath(campaign.shortId), "layout")

  return ok({ joinToken })
}
