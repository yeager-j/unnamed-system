import { and, asc, countDistinct, eq, or } from "drizzle-orm"

import type { ParticipantRef } from "@/domain/planner/participant"
import type { ParticipantRefCounts } from "@/domain/planner/view/world-detail"
import { db } from "@/lib/db/client"
import {
  campaignBeat,
  campaignBeatMention,
} from "@/lib/db/schema/campaign-notes"
import {
  campaignUpdate,
  campaignUpdateConcern,
} from "@/lib/db/schema/campaign-updates"
import {
  campaignRelation,
  type CampaignRelationRow,
} from "@/lib/db/schema/campaign-world"

/**
 * Reads over the **world web** (phase 6 — UNN-579): an entity's outgoing
 * relations and its reference counts. Campaign-scoped by WHERE (§5's read
 * half).
 */

/** An entity page's outgoing edges (the ticket's one-direction rule), oldest first. */
export async function loadRelationsFrom(
  campaignId: string,
  ref: Pick<ParticipantRef, "kind" | "id">
): Promise<CampaignRelationRow[]> {
  return db
    .select()
    .from(campaignRelation)
    .where(
      and(
        eq(campaignRelation.campaignId, campaignId),
        eq(campaignRelation.sourceKind, ref.kind),
        eq(campaignRelation.sourceId, ref.id)
      )
    )
    .orderBy(asc(campaignRelation.createdAt))
}

/**
 * What still points at a participant — the delete confirm's honest counts
 * (work item 5; replaces phase 2's hardcoded "Referenced nowhere yet"):
 * relations in **both** directions, updates where primary or concerned
 * (distinct — an update carrying the ref both ways counts once), and beats
 * whose bodies mention it. The mention join through `campaignBeat` is
 * mandatory — mentions carry no campaignId of their own.
 */
export async function loadParticipantRefCounts(
  campaignId: string,
  ref: Pick<ParticipantRef, "kind" | "id">
): Promise<ParticipantRefCounts> {
  const [relations, primaries, concerns, mentions] = await Promise.all([
    db
      .select({ count: countDistinct(campaignRelation.id) })
      .from(campaignRelation)
      .where(
        and(
          eq(campaignRelation.campaignId, campaignId),
          or(
            and(
              eq(campaignRelation.sourceKind, ref.kind),
              eq(campaignRelation.sourceId, ref.id)
            ),
            and(
              eq(campaignRelation.targetKind, ref.kind),
              eq(campaignRelation.targetId, ref.id)
            )
          )
        )
      ),
    db
      .select({ id: campaignUpdate.id })
      .from(campaignUpdate)
      .where(
        and(
          eq(campaignUpdate.campaignId, campaignId),
          eq(campaignUpdate.primaryKind, ref.kind),
          eq(campaignUpdate.primaryId, ref.id)
        )
      ),
    db
      .select({ id: campaignUpdateConcern.updateId })
      .from(campaignUpdateConcern)
      .innerJoin(
        campaignUpdate,
        eq(campaignUpdate.id, campaignUpdateConcern.updateId)
      )
      .where(
        and(
          eq(campaignUpdate.campaignId, campaignId),
          eq(campaignUpdateConcern.participantKind, ref.kind),
          eq(campaignUpdateConcern.participantId, ref.id)
        )
      ),
    db
      .select({ count: countDistinct(campaignBeatMention.beatId) })
      .from(campaignBeatMention)
      .innerJoin(campaignBeat, eq(campaignBeat.id, campaignBeatMention.beatId))
      .where(
        and(
          eq(campaignBeat.campaignId, campaignId),
          eq(campaignBeatMention.participantKind, ref.kind),
          eq(campaignBeatMention.participantId, ref.id)
        )
      ),
  ])

  const updateIds = new Set([
    ...primaries.map((row) => row.id),
    ...concerns.map((row) => row.id),
  ])
  return {
    relations: relations[0]?.count ?? 0,
    updates: updateIds.size,
    beatMentions: mentions[0]?.count ?? 0,
  }
}
