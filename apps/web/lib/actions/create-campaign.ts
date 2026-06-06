"use server"

import { unauthorized } from "next/navigation"

import { ok, type Result } from "@workspace/game/foundation/result"

import { auth } from "@/lib/auth"
import { createCampaign } from "@/lib/db/writes/campaign"

import {
  CreateCampaignSchema,
  type CreateCampaignError,
  type CreateCampaignInput,
} from "./create-campaign.schema"

/**
 * Creates a campaign owned by the signed-in caller (the DM) and returns its
 * public `shortId` so the client can redirect to the manage page
 * (`/campaigns/{shortId}`) — mirroring `startCharacterDraftAction`. A fresh
 * `joinToken` is minted by the column default. The only auth gate is "must be
 * signed in"; anyone can run their own campaign.
 */
export async function createCampaignAction(
  input: CreateCampaignInput
): Promise<Result<{ shortId: string }, CreateCampaignError>> {
  const session = await auth()
  if (!session?.user?.id) unauthorized()

  const parsed = CreateCampaignSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const { shortId } = await createCampaign({
    dmUserId: session.user.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  })

  return ok({ shortId })
}
