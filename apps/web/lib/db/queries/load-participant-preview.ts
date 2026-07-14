import { and, eq, inArray } from "drizzle-orm"

import { DUNGEON_STATUS_LABELS, ENCOUNTER_STATUS_LABELS } from "@/domain/labels"
import type { ParticipantRef } from "@/domain/planner/participant"
import {
  encounterDurableEnemyIds,
  encounterEnemyLabels,
  previewSummary,
  type ParticipantPreview,
} from "@/domain/planner/participant-preview"
import {
  characterTraitsLabel,
  npcTraitsLabel,
} from "@/domain/planner/view/linker"
import { db } from "@/lib/db/client"
import { characterSummaryProjection } from "@/lib/db/queries/character-list"
import { campaignArticle, campaignNpc } from "@/lib/db/schema/campaign-world"
import { dungeons } from "@/lib/db/schema/dungeon"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"

/**
 * The **hover-preview read** (UNN-622): one participant, campaign-scoped, one
 * round trip. `null` is a genuine miss (a cross-campaign id, or a ref whose
 * subject was hard-deleted) — the card says so rather than inventing a subject.
 *
 * Deliberately **`deletedAt`-blind**, like the resolver
 * (`load-participants.ts`): history survives its subjects, so a tombstoned NPC
 * previews muted instead of reading as a miss. This is also what lets an editor
 * chip whose ref has left the live world (and therefore resolves "missing"
 * against the linker's live snapshot) still show a card.
 */
export async function loadParticipantPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  switch (ref.kind) {
    case "npc":
      return loadNpcPreview(campaignId, ref)
    case "article":
      return loadArticlePreview(campaignId, ref)
    case "character":
      return loadCharacterPreview(campaignId, ref)
    case "encounter":
      return loadEncounterPreview(campaignId, ref)
    case "dungeon":
      return loadDungeonPreview(campaignId, ref)
  }
}

/**
 * Encounters hard-delete, so `tombstoned` is always false — a deleted
 * encounter is a miss (`null`), and the caller's captured label carries it.
 */
async function loadEncounterPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  const [row] = await db
    .select({
      name: encounters.name,
      shortId: encounters.shortId,
      status: encounters.status,
      session: encounters.session,
    })
    .from(encounters)
    .where(
      and(eq(encounters.campaignId, campaignId), eq(encounters.id, ref.id))
    )
  if (row === undefined) return null
  const count = row.session.participants.length
  return {
    ref,
    name: row.name,
    tombstoned: false,
    portraitUrl: null,
    sublabel: ENCOUNTER_STATUS_LABELS[row.status],
    summary: null,
    detail: `${count} ${count === 1 ? "participant" : "participants"}`,
    shortId: row.shortId,
    enemies: encounterEnemyLabels(
      row.session,
      await loadDurableNames(encounterDurableEnemyIds(row.session))
    ),
  }
}

/**
 * Names for a session's durable enemy refs (UNN-624 enemy chips) — the one
 * batch read the inline-heavy common case skips entirely (catalog enemies
 * materialize to inline at mint, so durable enemies are rare).
 */
async function loadDurableNames(
  ids: readonly string[]
): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: entity.id, name: entity.name })
    .from(entity)
    .where(inArray(entity.id, [...ids]))
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Dungeons hard-delete too — see {@link loadEncounterPreview}. */
async function loadDungeonPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  const [row] = await db
    .select({
      name: dungeons.name,
      shortId: dungeons.shortId,
      status: dungeons.status,
      state: dungeons.state,
    })
    .from(dungeons)
    .where(and(eq(dungeons.campaignId, campaignId), eq(dungeons.id, ref.id)))
  if (row === undefined) return null
  return {
    ref,
    name: row.name,
    tombstoned: false,
    portraitUrl: null,
    sublabel: DUNGEON_STATUS_LABELS[row.status],
    summary: null,
    detail: `Turn ${row.state.turnCounter}`,
    shortId: row.shortId,
    enemies: null,
  }
}

async function loadNpcPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  const [row] = await db
    .select({
      name: entity.name,
      portraitUrl: entity.portraitUrl,
      deletedAt: entity.deletedAt,
      arcana: campaignNpc.arcana,
      lineageKey: campaignNpc.lineageKey,
    })
    .from(campaignNpc)
    .innerJoin(entity, eq(entity.id, campaignNpc.entityId))
    .where(
      and(
        eq(campaignNpc.campaignId, campaignId),
        eq(campaignNpc.entityId, ref.id)
      )
    )
  if (row === undefined) return null
  return {
    ref,
    name: row.name,
    tombstoned: row.deletedAt !== null,
    portraitUrl: row.portraitUrl,
    sublabel: npcTraitsLabel(row),
    // NPCs have no summary field yet — its ticket fills this in.
    summary: null,
    detail: null,
    shortId: null,
    enemies: null,
  }
}

async function loadArticlePreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  const [row] = await db
    .select({
      name: campaignArticle.name,
      type: campaignArticle.type,
      body: campaignArticle.body,
      deletedAt: campaignArticle.deletedAt,
    })
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.campaignId, campaignId),
        eq(campaignArticle.id, ref.id)
      )
    )
  if (row === undefined) return null
  return {
    ref,
    name: row.name,
    tombstoned: row.deletedAt !== null,
    portraitUrl: null,
    sublabel: row.type,
    summary: previewSummary(row.body),
    detail: null,
    shortId: null,
    enemies: null,
  }
}

async function loadCharacterPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<ParticipantPreview | null> {
  const [row] = await db
    .select({ ...characterSummaryProjection, deletedAt: entity.deletedAt })
    .from(entity)
    .innerJoin(playerCharacter, eq(playerCharacter.entityId, entity.id))
    .where(
      and(
        eq(playerCharacter.campaignId, campaignId),
        eq(playerCharacter.entityId, ref.id)
      )
    )
  if (row === undefined) return null
  return {
    ref,
    name: row.name,
    tombstoned: row.deletedAt !== null,
    portraitUrl: row.portraitUrl,
    sublabel: characterTraitsLabel(row),
    summary: null,
    detail: null,
    shortId: row.shortId,
    enemies: null,
  }
}
