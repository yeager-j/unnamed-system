import { and, eq } from "drizzle-orm"

import type { ParticipantRef } from "@/domain/planner/participant"
import {
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
  }
}
