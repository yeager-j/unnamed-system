import { and, eq, inArray } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import type {
  ParticipantHit,
  ParticipantHitsByKind,
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import { db } from "@/lib/db/client"
import { campaignArticle, campaignNpc } from "@/lib/db/schema/campaign-world"
import { dungeons } from "@/lib/db/schema/dungeon"
import { encounters } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"
import { playerCharacter } from "@/lib/db/schema/player-character"

/**
 * The batched, **campaign-scoped** participant lookup (tech-design D4): refs
 * group by kind into at most one query per kind, and every WHERE carries the
 * `campaignId` — a cross-campaign id simply never comes back, folding to a
 * `missing` participant downstream. That scoping is one half of the FK-less
 * ref design's compensating invariant; {@link validateParticipantRefs} is the
 * write-boundary half.
 *
 * Deliberately **`deletedAt`-blind**: history survives its subjects — a
 * tombstoned NPC/Article must resolve to its name (rendered muted), not to a
 * miss. Discovery/list reads that must *exclude* tombstones live in
 * `load-campaign-world.ts`.
 */
export async function loadParticipantHits(
  campaignId: string,
  refs: readonly ParticipantRef[]
): Promise<ParticipantHitsByKind> {
  const idsOf = (kind: ParticipantKind) => [
    ...new Set(refs.filter((ref) => ref.kind === kind).map((ref) => ref.id)),
  ]
  const [articles, npcs, characters, encounterHits, dungeonHits] =
    await Promise.all([
      loadArticleHits(campaignId, idsOf("article")),
      loadNpcHits(campaignId, idsOf("npc")),
      loadCharacterHits(campaignId, idsOf("character")),
      loadEncounterHits(campaignId, idsOf("encounter")),
      loadDungeonHits(campaignId, idsOf("dungeon")),
    ])
  return {
    article: articles,
    npc: npcs,
    character: characters,
    encounter: encounterHits,
    dungeon: dungeonHits,
  }
}

/**
 * The **write-boundary rule** (tech-design §5, established in UNN-575): every
 * action that accepts participant refs validates them against the gated
 * campaign before writing. Stricter than the read resolver on purpose — a
 * lookup miss (including a forged cross-campaign id) *and* a tombstone both
 * reject: tombstones leave the linker, so no new reference may point at one.
 */
export async function validateParticipantRefs(
  campaignId: string,
  refs: readonly ParticipantRef[]
): Promise<Result<void, "invalid-ref">> {
  const hits = await loadParticipantHits(campaignId, refs)
  const allLive = refs.every((ref) => {
    const hit = hits[ref.kind].get(ref.id)
    return hit !== undefined && hit.deletedAt === null
  })
  return allLive ? ok(undefined) : err("invalid-ref")
}

async function loadArticleHits(
  campaignId: string,
  ids: readonly string[]
): Promise<ReadonlyMap<string, ParticipantHit>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({
      id: campaignArticle.id,
      name: campaignArticle.name,
      deletedAt: campaignArticle.deletedAt,
    })
    .from(campaignArticle)
    .where(
      and(
        eq(campaignArticle.campaignId, campaignId),
        inArray(campaignArticle.id, [...ids])
      )
    )
  return new Map(rows.map((row) => [row.id, hitOf(row)]))
}

async function loadNpcHits(
  campaignId: string,
  ids: readonly string[]
): Promise<ReadonlyMap<string, ParticipantHit>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({
      id: campaignNpc.entityId,
      name: entity.name,
      deletedAt: entity.deletedAt,
    })
    .from(campaignNpc)
    .innerJoin(entity, eq(entity.id, campaignNpc.entityId))
    .where(
      and(
        eq(campaignNpc.campaignId, campaignId),
        inArray(campaignNpc.entityId, [...ids])
      )
    )
  return new Map(rows.map((row) => [row.id, hitOf(row)]))
}

async function loadCharacterHits(
  campaignId: string,
  ids: readonly string[]
): Promise<ReadonlyMap<string, ParticipantHit>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({
      id: playerCharacter.entityId,
      name: entity.name,
      deletedAt: entity.deletedAt,
    })
    .from(playerCharacter)
    .innerJoin(entity, eq(entity.id, playerCharacter.entityId))
    .where(
      and(
        eq(playerCharacter.campaignId, campaignId),
        inArray(playerCharacter.entityId, [...ids])
      )
    )
  return new Map(rows.map((row) => [row.id, hitOf(row)]))
}

/**
 * Encounters hard-delete (no `deletedAt` column), so a hit is always live —
 * a deleted encounter is a lookup miss, never a tombstone (UNN-624).
 */
async function loadEncounterHits(
  campaignId: string,
  ids: readonly string[]
): Promise<ReadonlyMap<string, ParticipantHit>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: encounters.id, name: encounters.name })
    .from(encounters)
    .where(
      and(
        eq(encounters.campaignId, campaignId),
        inArray(encounters.id, [...ids])
      )
    )
  return new Map(
    rows.map((row) => [row.id, { name: row.name, deletedAt: null }])
  )
}

/** Dungeons hard-delete too — see {@link loadEncounterHits}. */
async function loadDungeonHits(
  campaignId: string,
  ids: readonly string[]
): Promise<ReadonlyMap<string, ParticipantHit>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: dungeons.id, name: dungeons.name })
    .from(dungeons)
    .where(
      and(eq(dungeons.campaignId, campaignId), inArray(dungeons.id, [...ids]))
    )
  return new Map(
    rows.map((row) => [row.id, { name: row.name, deletedAt: null }])
  )
}

function hitOf(row: { name: string; deletedAt: Date | null }): ParticipantHit {
  return { name: row.name, deletedAt: row.deletedAt }
}
