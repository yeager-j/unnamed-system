"use server"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type { ParticipantRef } from "@/domain/planner/participant"
import { groupPeriodsByKind } from "@/domain/planner/period"
import { buildChronicleDayViews } from "@/domain/planner/view/chronicle"
import type { TimelineDayView } from "@/domain/planner/view/timeline"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadPeriods } from "@/lib/db/queries/load-campaign-clock"
import {
  decodeChronicleCursor,
  loadChroniclePage,
} from "@/lib/db/queries/load-campaign-updates"
import { loadParticipantHits } from "@/lib/db/queries/load-participants"

import {
  LoadChroniclePageSchema,
  type LoadChroniclePageActionError,
  type LoadChroniclePageInput,
} from "./chronicle.schema"

/** One fetched slice, participants already resolved — append-ready. */
export interface ChronicleSlice {
  days: TimelineDayView[]
  nextCursor: string | null
}

/**
 * Fetches an older Chronicle page (UNN-580) — the repo's first **read-only**
 * Server Action (`lib/actions/CLAUDE.md` documents the precedent): same
 * parse → `requireCampaignDM` shape as every write, no revalidation because
 * nothing changed. Returns fully-shaped day views (participants resolved,
 * seasons labeled) so the client only merges. The feed's "Load earlier days"
 * calls this; an IntersectionObserver upgrade calls this same action. A
 * cursor is always present — the first page renders server-side in the
 * route.
 */
export async function loadChroniclePageAction(
  input: LoadChroniclePageInput
): Promise<Result<ChronicleSlice, LoadChroniclePageActionError>> {
  const parsed = LoadChroniclePageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }
  if (decodeChronicleCursor(parsed.data.cursor) === null)
    return err("invalid-input")

  const campaign = await requireCampaignDM(parsed.data.campaignId)

  const [page, periods] = await Promise.all([
    loadChroniclePage(campaign.id, {
      cursor: parsed.data.cursor,
      startDay: null,
      filters: parsed.data.filters,
    }),
    loadPeriods(campaign.id),
  ])
  const { season: seasons, month: months } = groupPeriodsByKind(periods)

  const refs: ParticipantRef[] = page.updates.flatMap((update) => [
    ...(update.primary ? [update.primary] : []),
    ...update.concerns,
    ...(update.resolvesArticleId
      ? [{ kind: "article" as const, id: update.resolvesArticleId }]
      : []),
  ])
  const hits = await loadParticipantHits(campaign.id, refs)

  return ok({
    days: buildChronicleDayViews(page.updates, hits, { seasons, months }),
    nextCursor: page.nextCursor,
  })
}
