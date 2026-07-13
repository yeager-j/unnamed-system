"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  bindDeadlineMarker,
  reopenDeadline,
  resolveDeadline,
} from "@/lib/db/writes/campaign-updates"

import {
  BindDeadlineMarkerSchema,
  ReopenDeadlineSchema,
  ResolveDeadlineSchema,
  type BindDeadlineMarkerActionError,
  type BindDeadlineMarkerInput,
  type ReopenDeadlineActionError,
  type ReopenDeadlineInput,
  type ResolveDeadlineActionError,
  type ResolveDeadlineInput,
} from "./resolve-deadline.schema"
import { revalidateCampaignUpdates } from "./revalidate"

/**
 * Resolves a deadline (D5, UNN-578): writes the ⚑ marker — a world update
 * primaried on the dated article with `resolvesArticleId` bound. Idempotent
 * under double-clicks (the partial unique). The Calendar mounts this in
 * phase 5; the Article page (phase 6) and the Day-End alert (phase 7) mount
 * the same action later.
 */
export async function resolveDeadlineAction(
  input: ResolveDeadlineInput
): Promise<Result<{ updateId: string | null }, ResolveDeadlineActionError>> {
  const parsed = ResolveDeadlineSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await resolveDeadline(parsed.data)
  if (result.ok) revalidateCampaignUpdates(campaign)
  return result
}

/**
 * Re-opens a resolved deadline by unbinding its ⚑ marker (D5: unbind, never
 * delete — the prose survives as an ordinary world update). An overdue
 * re-opened deadline renders Due and blocks the next advance.
 */
export async function reopenDeadlineAction(
  input: ReopenDeadlineInput
): Promise<Result<void, ReopenDeadlineActionError>> {
  const parsed = ReopenDeadlineSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await reopenDeadline(parsed.data)
  if (result.ok) revalidateCampaignUpdates(campaign)
  return result
}

/**
 * Binds an existing world update to a deadline as its ⚑ marker — the
 * "↳ Resolves a deadline" control (FR-12, UNN-580). Conflicts are reported,
 * not swallowed (contrast {@link resolveDeadlineAction}'s idempotent insert);
 * unbinding is {@link reopenDeadlineAction} — the marker is unique per
 * article, so re-opening the article IS unbinding the update.
 */
export async function bindDeadlineMarkerAction(
  input: BindDeadlineMarkerInput
): Promise<Result<void, BindDeadlineMarkerActionError>> {
  const parsed = BindDeadlineMarkerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const result = await bindDeadlineMarker({
    ...parsed.data,
    campaignId: campaign.id,
  })
  if (result.ok) revalidateCampaignUpdates(campaign)
  return result
}
