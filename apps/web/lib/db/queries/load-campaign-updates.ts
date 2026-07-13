import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm"

import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import type { EntityTimelineUpdateInput } from "@/domain/planner/view/world-detail"
import { db } from "@/lib/db/client"
import {
  campaignUpdate,
  campaignUpdateConcern,
  type UpdateCategory,
} from "@/lib/db/schema/campaign-updates"

/**
 * Read side of the update stream (UNN-576): the Day Runner's recorded
 * activities. Campaign-scoped by WHERE (§5's read half); the Chronicle's
 * cursor-paged read arrives with its surface (phase 7).
 */

/** A live ⚑ marker: which article it resolves, from which update, stamped on which day (D5). */
export interface ResolvedMarker {
  articleId: string
  updateId: string
  day: number
}

/**
 * Every live ⚑ marker in the campaign — "resolved" set membership for the
 * deadline selectors plus the Reopen affordance's target. At most one per
 * article (the partial unique).
 */
export async function loadResolvedMarkers(
  campaignId: string
): Promise<ResolvedMarker[]> {
  const rows = await db
    .select({
      articleId: campaignUpdate.resolvesArticleId,
      updateId: campaignUpdate.id,
      day: campaignUpdate.day,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaignId),
        isNotNull(campaignUpdate.resolvesArticleId)
      )
    )
  return rows.map((row) => ({ ...row, articleId: row.articleId! }))
}

/** A recorded activity with its concerns folded in — the workspace's unit. */
export interface LoadedActivity {
  id: string
  slotId: string
  /** The character's entity id (slotted rows always carry a character primary). */
  characterId: string
  body: string
  category: UpdateCategory | null
  authoredAt: Date
  concerns: { kind: ParticipantKind; id: string }[]
}

/** The runner's workspace read: every activity recorded into `slotIds`. */
export async function loadActivitiesForSlots(
  campaignId: string,
  slotIds: readonly string[]
): Promise<LoadedActivity[]> {
  if (slotIds.length === 0) return []
  const rows = await db
    .select({
      id: campaignUpdate.id,
      slotId: campaignUpdate.slotId,
      characterId: campaignUpdate.primaryId,
      body: campaignUpdate.body,
      category: campaignUpdate.category,
      authoredAt: campaignUpdate.authoredAt,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaignId),
        inArray(campaignUpdate.slotId, [...slotIds])
      )
    )
    .orderBy(campaignUpdate.authoredAt)

  const concernsByUpdate = await loadConcerns(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    slotId: row.slotId!,
    characterId: row.characterId!,
    body: row.body,
    category: row.category,
    authoredAt: row.authoredAt,
    concerns: concernsByUpdate.get(row.id) ?? [],
  }))
}

/**
 * Each character's most recent recorded activity — the composer's
 * "repeat last activity" + category pre-fill source (§2's copy affordances).
 * Newest-first scan folded to first-per-character; bounded, since only the
 * latest few hundred rows can matter for a live campaign's roster.
 */
export async function loadLastActivityPerCharacter(
  campaignId: string
): Promise<Map<string, LoadedActivity>> {
  const rows = await db
    .select({
      id: campaignUpdate.id,
      slotId: campaignUpdate.slotId,
      characterId: campaignUpdate.primaryId,
      body: campaignUpdate.body,
      category: campaignUpdate.category,
      authoredAt: campaignUpdate.authoredAt,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaignId),
        eq(campaignUpdate.primaryKind, "character"),
        isNotNull(campaignUpdate.slotId)
      )
    )
    .orderBy(desc(campaignUpdate.authoredAt))
    .limit(500)

  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!latest.has(row.characterId!)) latest.set(row.characterId!, row)
  }
  const concernsByUpdate = await loadConcerns(
    [...latest.values()].map((row) => row.id)
  )
  return new Map(
    [...latest.entries()].map(([characterId, row]) => [
      characterId,
      {
        id: row.id,
        slotId: row.slotId!,
        characterId,
        body: row.body,
        category: row.category,
        authoredAt: row.authoredAt,
        concerns: concernsByUpdate.get(row.id) ?? [],
      },
    ])
  )
}

/**
 * The per-entity timeline read (phase 6, PRD FR-10): every update where the
 * ref is **primary or concerned** — the union the two indexes were built for
 * (§3) — ordered `(day, authoredAt)`, concerns folded in for the participant
 * strip. Capped to the **newest** 200 (fetched descending so the cap trims
 * history, not the present, then re-sorted chronological for display); real
 * pagination is the Chronicle's (phase 7).
 */
export async function loadUpdatesForParticipant(
  campaignId: string,
  ref: Pick<ParticipantRef, "kind" | "id">
): Promise<EntityTimelineUpdateInput[]> {
  const concernedIds = db
    .select({ updateId: campaignUpdateConcern.updateId })
    .from(campaignUpdateConcern)
    .where(
      and(
        eq(campaignUpdateConcern.participantKind, ref.kind),
        eq(campaignUpdateConcern.participantId, ref.id)
      )
    )
  const rows = await db
    .select({
      id: campaignUpdate.id,
      day: campaignUpdate.day,
      body: campaignUpdate.body,
      category: campaignUpdate.category,
      primaryKind: campaignUpdate.primaryKind,
      primaryId: campaignUpdate.primaryId,
      slotId: campaignUpdate.slotId,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaignId),
        or(
          and(
            eq(campaignUpdate.primaryKind, ref.kind),
            eq(campaignUpdate.primaryId, ref.id)
          ),
          inArray(campaignUpdate.id, concernedIds)
        )
      )
    )
    .orderBy(desc(campaignUpdate.day), desc(campaignUpdate.authoredAt))
    .limit(200)
  rows.reverse()

  const concernsByUpdate = await loadConcerns(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    day: row.day,
    body: row.body,
    category: row.category,
    primary:
      row.primaryKind === null
        ? null
        : { kind: row.primaryKind, id: row.primaryId! },
    concerns: concernsByUpdate.get(row.id) ?? [],
    isWorld: row.slotId === null,
  }))
}

async function loadConcerns(
  updateIds: readonly string[]
): Promise<Map<string, { kind: ParticipantKind; id: string }[]>> {
  if (updateIds.length === 0) return new Map()
  const rows = await db
    .select()
    .from(campaignUpdateConcern)
    .where(inArray(campaignUpdateConcern.updateId, [...updateIds]))
  const byUpdate = new Map<string, { kind: ParticipantKind; id: string }[]>()
  for (const row of rows) {
    const refs = byUpdate.get(row.updateId) ?? []
    refs.push({ kind: row.participantKind, id: row.participantId })
    byUpdate.set(row.updateId, refs)
  }
  return byUpdate
}
