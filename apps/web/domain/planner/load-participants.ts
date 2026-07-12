import { loadParticipantHits } from "@/lib/db/queries/load-participants"

import {
  foldResolvedParticipants,
  type ParticipantRef,
  type ResolvedParticipant,
} from "./participant"

/**
 * The campaign-scoped participant resolver (tech-design D4): looks refs up
 * within the campaign (a cross-campaign or dangling id resolves `missing`,
 * never a page break; a tombstone resolves `tombstoned` and renders muted).
 * The composition seam: `lib`'s batched read ∘ the pure fold.
 */
export async function resolveParticipants(
  campaignId: string,
  refs: readonly ParticipantRef[]
): Promise<ResolvedParticipant[]> {
  return foldResolvedParticipants(
    refs,
    await loadParticipantHits(campaignId, refs)
  )
}
