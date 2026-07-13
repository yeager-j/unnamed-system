import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import type { BondActivityTuple } from "@/domain/planner/bond"
import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import type { TimelineUpdateInput } from "@/domain/planner/view/timeline"
import { db } from "@/lib/db/client"
import {
  campaignUpdate,
  campaignUpdateConcern,
  type UpdateCategory,
} from "@/lib/db/schema/campaign-updates"
import { campaignNpc } from "@/lib/db/schema/campaign-world"

/**
 * Read side of the update stream (UNN-576): the Day Runner's recorded
 * activities, the per-entity timelines, and the Chronicle's cursor-paged
 * feed (phase 7). Campaign-scoped by WHERE (§5's read half).
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
): Promise<TimelineUpdateInput[]> {
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
      resolvesArticleId: campaignUpdate.resolvesArticleId,
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
    resolvesArticleId: row.resolvesArticleId,
  }))
}

/** The Chronicle's filter set — AND-ed onto the cursor scan (order unchanged). */
export interface ChronicleFilters {
  /** Primary-or-concerned, the same union as {@link loadUpdatesForParticipant}. */
  participant: Pick<ParticipantRef, "kind" | "id"> | null
  category: UpdateCategory | null
  /** Default false — mirrors `isShownByDefaultInChronicle` (pinned both ways). */
  showIdle: boolean
}

/** One Chronicle row: the timeline input plus the cursor's tiebreak column. */
export interface ChronicleUpdateRow extends TimelineUpdateInput {
  authoredAt: Date
}

/** One keyset page, newest-first; `nextCursor` null when history is exhausted. */
export interface ChroniclePage {
  updates: ChronicleUpdateRow[]
  nextCursor: string | null
}

const CHRONICLE_PAGE_SIZE = 50
const CHRONICLE_PAGE_SIZE_CAP = 100

/**
 * The Chronicle's cursor-paged read (phase 7, FR-13) — the codebase's first
 * **keyset** query: ordered `(day, authoredAt, id) DESC` riding
 * `campaignUpdate_chronicle_cursor_idx`, with `id` breaking the timestamp
 * ties bulk inserts create (end-day Idle fill, montage). The cursor is an
 * opaque token of the page's last row; filters AND onto the scan without
 * changing its order, so pages stay full under any filter. `startDay` is the
 * Day-End "jump into the Chronicle at day N" bound — first page only, since
 * a cursor already implies it.
 */
export async function loadChroniclePage(
  campaignId: string,
  input: {
    cursor: string | null
    startDay: number | null
    filters: ChronicleFilters
    pageSize?: number
  }
): Promise<ChroniclePage> {
  const pageSize = Math.min(
    input.pageSize ?? CHRONICLE_PAGE_SIZE,
    CHRONICLE_PAGE_SIZE_CAP
  )
  const cursor =
    input.cursor === null ? null : decodeChronicleCursor(input.cursor)

  const predicates: (SQL | undefined)[] = [
    eq(campaignUpdate.campaignId, campaignId),
  ]
  if (cursor !== null) {
    predicates.push(
      sql`(${campaignUpdate.day}, ${campaignUpdate.authoredAt}, ${campaignUpdate.id}) < (${cursor.day}, ${cursor.authoredAt}, ${cursor.id})`
    )
  } else if (input.startDay !== null) {
    predicates.push(lte(campaignUpdate.day, input.startDay))
  }
  if (!input.filters.showIdle) {
    // The SQL half of `isShownByDefaultInChronicle` — filtered here, not
    // client-side, so pages stay full (both halves pinned by tests).
    predicates.push(
      or(isNull(campaignUpdate.category), ne(campaignUpdate.category, "idle"))
    )
  }
  if (input.filters.category !== null) {
    predicates.push(eq(campaignUpdate.category, input.filters.category))
  }
  if (input.filters.participant !== null) {
    const ref = input.filters.participant
    const concernedIds = db
      .select({ updateId: campaignUpdateConcern.updateId })
      .from(campaignUpdateConcern)
      .where(
        and(
          eq(campaignUpdateConcern.participantKind, ref.kind),
          eq(campaignUpdateConcern.participantId, ref.id)
        )
      )
    predicates.push(
      or(
        and(
          eq(campaignUpdate.primaryKind, ref.kind),
          eq(campaignUpdate.primaryId, ref.id)
        ),
        inArray(campaignUpdate.id, concernedIds)
      )
    )
  }

  const rows = await db
    .select({
      id: campaignUpdate.id,
      day: campaignUpdate.day,
      body: campaignUpdate.body,
      category: campaignUpdate.category,
      primaryKind: campaignUpdate.primaryKind,
      primaryId: campaignUpdate.primaryId,
      slotId: campaignUpdate.slotId,
      resolvesArticleId: campaignUpdate.resolvesArticleId,
      authoredAt: campaignUpdate.authoredAt,
    })
    .from(campaignUpdate)
    .where(and(...predicates))
    .orderBy(
      desc(campaignUpdate.day),
      desc(campaignUpdate.authoredAt),
      desc(campaignUpdate.id)
    )
    .limit(pageSize + 1)

  const page = rows.slice(0, pageSize)
  const last = page.at(-1)
  const concernsByUpdate = await loadConcerns(page.map((row) => row.id))
  return {
    updates: page.map((row) => ({
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
      resolvesArticleId: row.resolvesArticleId,
      authoredAt: row.authoredAt,
    })),
    nextCursor:
      rows.length > pageSize && last !== undefined
        ? encodeChronicleCursor(last)
        : null,
  }
}

/**
 * Encodes a page's last row as the opaque next-page token: base64url JSON of
 * the three cursor columns. Opaque on purpose — the client stores and
 * returns it, never reads it.
 */
export function encodeChronicleCursor(row: {
  day: number
  authoredAt: Date
  id: string
}): string {
  return Buffer.from(
    JSON.stringify({ d: row.day, a: row.authoredAt.toISOString(), i: row.id })
  ).toString("base64url")
}

/** Decodes a cursor token; garbage (tampered or truncated) returns null. */
export function decodeChronicleCursor(
  token: string
): { day: number; authoredAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    )
    if (typeof parsed !== "object" || parsed === null) return null
    const { d, a, i } = parsed as { d?: unknown; a?: unknown; i?: unknown }
    if (typeof d !== "number" || typeof a !== "string" || typeof i !== "string")
      return null
    const authoredAt = new Date(a)
    if (Number.isNaN(authoredAt.getTime())) return null
    return { day: d, authoredAt, id: i }
  } catch {
    return null
  }
}

/** A world update authored on a given day — Day-End's "logged today" slice. */
export interface LoadedWorldUpdate {
  id: string
  body: string
  category: UpdateCategory | null
  primary: Pick<ParticipantRef, "kind" | "id"> | null
  resolvesArticleId: string | null
  authoredAt: Date
  concerns: { kind: ParticipantKind; id: string }[]
}

/**
 * Every slot-less update stamped on `day` — Day-End Capture's world half of
 * the "Logged today" feed and its "M world updates logged" glance count.
 * Rides the chronicle cursor index.
 */
export async function loadWorldUpdatesForDay(
  campaignId: string,
  day: number
): Promise<LoadedWorldUpdate[]> {
  const rows = await db
    .select({
      id: campaignUpdate.id,
      body: campaignUpdate.body,
      category: campaignUpdate.category,
      primaryKind: campaignUpdate.primaryKind,
      primaryId: campaignUpdate.primaryId,
      resolvesArticleId: campaignUpdate.resolvesArticleId,
      authoredAt: campaignUpdate.authoredAt,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaignId),
        eq(campaignUpdate.day, day),
        isNull(campaignUpdate.slotId)
      )
    )
    .orderBy(campaignUpdate.authoredAt)

  const concernsByUpdate = await loadConcerns(rows.map((row) => row.id))
  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    category: row.category,
    primary:
      row.primaryKind === null
        ? null
        : { kind: row.primaryKind, id: row.primaryId! },
    resolvesArticleId: row.resolvesArticleId,
    authoredAt: row.authoredAt,
    concerns: concernsByUpdate.get(row.id) ?? [],
  }))
}

/**
 * The bond-progress read (D8): every Collaborator-category update concerning
 * one of the gate NPCs, authored after that NPC's `bondTierChangedAt` (a null
 * timestamp means "never changed" — the whole history counts, bounded by the
 * campaign's collaborator updates on the concern index). Slotted activities
 * always carry a character primary (write-boundary rule), which is the PC the
 * one-per-PC-per-day cap keys on — the cap itself lives in
 * {@link import("@/domain/planner/bond").bondEligibility}, not here.
 */
export async function loadBondActivityTuples(
  campaignId: string,
  npcIds: readonly string[]
): Promise<BondActivityTuple[]> {
  if (npcIds.length === 0) return []
  return db
    .select({
      npcId: campaignUpdateConcern.participantId,
      pcId: campaignUpdate.primaryId,
      day: campaignUpdate.day,
    })
    .from(campaignUpdateConcern)
    .innerJoin(
      campaignUpdate,
      eq(campaignUpdate.id, campaignUpdateConcern.updateId)
    )
    .innerJoin(
      campaignNpc,
      eq(campaignNpc.entityId, campaignUpdateConcern.participantId)
    )
    .where(
      and(
        eq(campaignUpdateConcern.participantKind, "npc"),
        inArray(campaignUpdateConcern.participantId, [...npcIds]),
        eq(campaignUpdate.campaignId, campaignId),
        eq(campaignNpc.campaignId, campaignId),
        eq(campaignUpdate.category, "collaborator"),
        eq(campaignUpdate.primaryKind, "character"),
        sql`${campaignUpdate.authoredAt} > COALESCE(${campaignNpc.bondTierChangedAt}, to_timestamp(0))`
      )
    )
    .then((rows) =>
      rows.map((row) => ({ npcId: row.npcId, pcId: row.pcId!, day: row.day }))
    )
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
