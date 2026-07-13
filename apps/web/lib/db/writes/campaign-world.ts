import { and, eq, or } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"
import {
  emptyNarrative,
  NARRATIVE_TEXT_FIELDS,
  type NarrativeTextField,
} from "@workspace/game-v2/narrative"

import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import { db, type WriteExecutor } from "@/lib/db/client"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import {
  campaignArticle,
  campaignNpc,
  campaignRelation,
  type ArticleDatedKind,
} from "@/lib/db/schema/campaign-world"
import { entity } from "@/lib/db/schema/entity"
import { insertWithShortId } from "@/lib/db/short-id"

/**
 * Persistence for the campaign **world substrate** (UNN-575): NPCs and
 * Articles. Auth-free like the other write wrappers — `requireCampaignDM`
 * lives at the Server Action boundary (`lib/actions/campaign-world/`).
 *
 * Every write here scopes its target by `(id, campaignId)` — the
 * **write-boundary rule** (tech-design §5) that compensates the FK-less
 * participant-ref design: a forged or cross-campaign id matches zero rows and
 * errors, never touches another campaign's world.
 */

/**
 * Mints an NPC: an `entity` substrate row **plus its `campaignNpc` subtype
 * row** in one transaction — the shared-id dual-mint (D2), the first
 * production sibling of the PC mint in `lib/actions/entity/start-draft.ts`.
 * No components on mint: a quick-minted NPC is a **stub** (name only), and
 * the absent `narrative` component is one leg of `isStubNpc`.
 */
export async function mintNpc(input: {
  campaignId: string
  name: string
}): Promise<{ entityId: string; shortId: string }> {
  return insertWithShortId(async (candidate) => {
    return db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(entity)
        .values({ shortId: candidate, name: input.name })
        .returning({ id: entity.id })

      await tx.insert(campaignNpc).values({
        entityId: inserted!.id,
        campaignId: input.campaignId,
      })

      return { entityId: inserted!.id, shortId: candidate }
    })
  })
}

/** Mints an Article (a plain row — Articles are not entities). */
export async function mintArticle(input: {
  campaignId: string
  name: string
  type?: string | null
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(campaignArticle)
    .values({
      campaignId: input.campaignId,
      name: input.name,
      type: input.type ?? null,
    })
    .returning({ id: campaignArticle.id })
  return row!
}

export type ArticleDateError = "article-not-found" | "article-resolved"

/**
 * Sets (or re-dates) an article's dated facet (D5): `datedDay` + `datedKind`,
 * CHECK-enforced set-together. A **resolved** article refuses (`unbind first`,
 * D5's re-dating guard — else "resolved before it looms" becomes
 * representable); the guard covers set, edit, *and* clear. The other
 * direction of the marker⟷anchor bind — a ⚑-bound update cannot be re-dated —
 * is structurally enforced today (no update-re-date write exists); when
 * phase 7 adds re-dating (detach + set day), that write must refuse while
 * `resolvesArticleId IS NOT NULL`.
 */
export async function setArticleDate(input: {
  campaignId: string
  articleId: string
  day: number
  kind: ArticleDatedKind
}): Promise<Result<void, ArticleDateError>> {
  return patchArticleDate(input, { datedDay: input.day, datedKind: input.kind })
}

/** Clears the dated facet (both columns — the CHECK requires set-together). Same resolved guard as {@link setArticleDate}. */
export async function clearArticleDate(input: {
  campaignId: string
  articleId: string
}): Promise<Result<void, ArticleDateError>> {
  return patchArticleDate(input, { datedDay: null, datedKind: null })
}

async function patchArticleDate(
  input: { campaignId: string; articleId: string },
  patch: { datedDay: number | null; datedKind: ArticleDatedKind | null }
): Promise<Result<void, ArticleDateError>> {
  return db.transaction(async (tx) => {
    const [article] = await tx
      .select({ id: campaignArticle.id, deletedAt: campaignArticle.deletedAt })
      .from(campaignArticle)
      .where(
        and(
          eq(campaignArticle.id, input.articleId),
          eq(campaignArticle.campaignId, input.campaignId)
        )
      )
    if (!article || article.deletedAt !== null) return err("article-not-found")

    const [marker] = await tx
      .select({ id: campaignUpdate.id })
      .from(campaignUpdate)
      .where(eq(campaignUpdate.resolvesArticleId, input.articleId))
    if (marker) return err("article-resolved")

    await tx
      .update(campaignArticle)
      .set(patch)
      .where(eq(campaignArticle.id, input.articleId))
    return ok(undefined)
  })
}

/** The article content fields the prose autosave may patch. */
export interface ArticleProsePatch {
  name?: string
  body?: string
}

/**
 * The article prose autosave (D10): patches `name`/`body` LWW. Refuses a
 * tombstone — the editor only mounts on live articles, so a hit here means a
 * stale tab racing a delete, and reviving a tombstone's content silently
 * would contradict D4.
 */
export async function saveArticleProse(input: {
  campaignId: string
  articleId: string
  patch: ArticleProsePatch
}): Promise<Result<void, "article-not-found">> {
  return db.transaction(async (tx) => {
    const [article] = await tx
      .select({ deletedAt: campaignArticle.deletedAt })
      .from(campaignArticle)
      .where(
        and(
          eq(campaignArticle.id, input.articleId),
          eq(campaignArticle.campaignId, input.campaignId)
        )
      )
    if (!article || article.deletedAt !== null) return err("article-not-found")

    await tx
      .update(campaignArticle)
      .set(input.patch)
      .where(eq(campaignArticle.id, input.articleId))
    return ok(undefined)
  })
}

/** Sets an article's label-only `type` (null clears). LWW. */
export async function setArticleType(input: {
  campaignId: string
  articleId: string
  type: string | null
}): Promise<Result<void, "article-not-found">> {
  const updated = await db
    .update(campaignArticle)
    .set({ type: input.type })
    .where(
      and(
        eq(campaignArticle.id, input.articleId),
        eq(campaignArticle.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignArticle.id })
  return updated.length === 0 ? err("article-not-found") : ok(undefined)
}

export type NpcWriteError = "npc-not-found"

/**
 * Renames an NPC — the entity substrate's `name`, reached through the
 * subtype's `(entityId, campaignId)` boundary check (the direct-entity-write
 * precedent set by {@link softDeleteNpc}). LWW.
 */
export async function saveNpcName(input: {
  campaignId: string
  entityId: string
  name: string
}): Promise<Result<void, NpcWriteError>> {
  return db.transaction(async (tx) => {
    const npc = await liveNpcInCampaign(tx, input.campaignId, input.entityId)
    if (!npc) return err("npc-not-found")
    await tx
      .update(entity)
      .set({ name: input.name })
      .where(eq(entity.id, input.entityId))
    return ok(undefined)
  })
}

/**
 * The NPC Identity/Origins autosave (D10): one narrative **field** per write,
 * read-merge-written inside the transaction — the per-field doctrine (the
 * UNN-226 clobber lesson), since debounced saves of different fields must
 * never compose a full object from stale client state. Trimmed-empty stores
 * `null`, and a narrative whose every field is empty normalizes the whole
 * column back to `null` so `isStubNpc`'s narrative leg stays honest.
 *
 * Deliberately not the entity door: NPC prose is the LWW lane (no version
 * token, D10), and the door's identity-class gate is the PC owner's
 * (`requireEntityOwner`) by design — the DM authorizes here via
 * `requireCampaignDM` at the action boundary.
 */
export async function saveNpcNarrativeField(input: {
  campaignId: string
  entityId: string
  field: NarrativeTextField
  value: string
}): Promise<Result<void, NpcWriteError>> {
  return db.transaction(async (tx) => {
    const npc = await liveNpcInCampaign(tx, input.campaignId, input.entityId)
    if (!npc) return err("npc-not-found")

    const [row] = await tx
      .select({ narrative: entity.narrative })
      .from(entity)
      .where(eq(entity.id, input.entityId))
      .for("update")
    const current = row?.narrative ?? emptyNarrative()
    const trimmed = input.value.trim()
    const next = {
      ...current,
      [input.field]: trimmed === "" ? null : input.value,
    }

    await tx
      .update(entity)
      .set({ narrative: isEmptyNarrative(next) ? null : next })
      .where(eq(entity.id, input.entityId))
    return ok(undefined)
  })
}

/**
 * Sets (or clears) an NPC's Arcana — advisory only, no constraint (D8). A
 * tombstone refuses (the subtype row outlives the entity, so a stale page
 * could otherwise write traits onto a deleted NPC).
 */
export async function setNpcArcana(input: {
  campaignId: string
  entityId: string
  arcana: string | null
}): Promise<Result<void, NpcWriteError>> {
  return db.transaction(async (tx) => {
    const npc = await liveNpcInCampaign(tx, input.campaignId, input.entityId)
    if (!npc) return err("npc-not-found")
    await tx
      .update(campaignNpc)
      .set({ arcana: input.arcana })
      .where(eq(campaignNpc.entityId, input.entityId))
    return ok(undefined)
  })
}

export type CasNpcBondTierError = NpcWriteError | "stale"

/**
 * Compare-and-set an NPC's party-wide bond tier (D8). The `bondTier =
 * expectedTier` guard makes a double-confirm from two surfaces converge on
 * one advance — the second write matches zero rows and reports `stale`.
 * Every path through here (confirm, manual set, regress) stamps
 * `bondTierChangedAt`, restarting the derived progress clock: activities
 * older than the new timestamp never count again (D8's documented regress
 * cost). A tombstone refuses, as with every NPC trait write.
 */
export async function casNpcBondTier(input: {
  campaignId: string
  entityId: string
  expectedTier: number
  tier: number
}): Promise<Result<void, CasNpcBondTierError>> {
  return db.transaction(async (tx) => {
    const npc = await liveNpcInCampaign(tx, input.campaignId, input.entityId)
    if (!npc) return err("npc-not-found")
    const updated = await tx
      .update(campaignNpc)
      .set({ bondTier: input.tier, bondTierChangedAt: new Date() })
      .where(
        and(
          eq(campaignNpc.entityId, input.entityId),
          eq(campaignNpc.campaignId, input.campaignId),
          eq(campaignNpc.bondTier, input.expectedTier)
        )
      )
      .returning({ entityId: campaignNpc.entityId })
    return updated.length === 0 ? err("stale") : ok(undefined)
  })
}

export type SetNpcLineageError = NpcWriteError | "lineage-taken"

/**
 * Sets (or clears) an NPC's Lineage — the hard-unique Atlas-gate lane (D8).
 * The pre-check turns the common case into a domain error the picker can
 * phrase ("held by ⟨name⟩"); the partial unique index remains the backstop
 * for the race the read can't see, mapped to the same error. A tombstone
 * refuses — the partial unique still counts a tombstone's row, so a stale
 * page assigning here would lock the Lineage invisibly (holders are built
 * from live NPCs only).
 */
export async function setNpcLineage(input: {
  campaignId: string
  entityId: string
  lineageKey: Lineage | null
}): Promise<Result<void, SetNpcLineageError>> {
  return mapLineageRaceToTaken(
    db.transaction(async (tx) => {
      const npc = await liveNpcInCampaign(tx, input.campaignId, input.entityId)
      if (!npc) return err("npc-not-found")
      if (input.lineageKey !== null) {
        const [holder] = await tx
          .select({ entityId: campaignNpc.entityId })
          .from(campaignNpc)
          .where(
            and(
              eq(campaignNpc.campaignId, input.campaignId),
              eq(campaignNpc.lineageKey, input.lineageKey)
            )
          )
        if (holder && holder.entityId !== input.entityId) {
          return err("lineage-taken")
        }
      }
      const updated = await tx
        .update(campaignNpc)
        .set({ lineageKey: input.lineageKey })
        .where(
          and(
            eq(campaignNpc.entityId, input.entityId),
            eq(campaignNpc.campaignId, input.campaignId)
          )
        )
        .returning({ entityId: campaignNpc.entityId })
      return updated.length === 0 ? err("npc-not-found") : ok(undefined)
    })
  )
}

/**
 * Adds a directed relation edge (phase 6, §3) — optionally with its reverse
 * in the same transaction ("also add the reverse" is a write-time
 * convenience, never a stored fact). Endpoint refs are validated at the
 * action boundary (`validateParticipantRefs`); parallel labeled edges are
 * legal by design, so there is nothing to conflict with here.
 */
export async function addRelation(input: {
  campaignId: string
  source: Pick<ParticipantRef, "kind" | "id">
  target: Pick<ParticipantRef, "kind" | "id">
  label: string | null
  alsoReverse: boolean
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(campaignRelation)
      .values({
        campaignId: input.campaignId,
        sourceKind: input.source.kind,
        sourceId: input.source.id,
        targetKind: input.target.kind,
        targetId: input.target.id,
        label: input.label,
      })
      .returning({ id: campaignRelation.id })
    if (input.alsoReverse) {
      await tx.insert(campaignRelation).values({
        campaignId: input.campaignId,
        sourceKind: input.target.kind,
        sourceId: input.target.id,
        targetKind: input.source.kind,
        targetId: input.source.id,
        label: input.label,
      })
    }
    return row!
  })
}

/** Removes one relation edge (only ever the rendered direction). */
export async function removeRelation(input: {
  campaignId: string
  relationId: string
}): Promise<Result<void, "relation-not-found">> {
  const deleted = await db
    .delete(campaignRelation)
    .where(
      and(
        eq(campaignRelation.id, input.relationId),
        eq(campaignRelation.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignRelation.id })
  return deleted.length === 0 ? err("relation-not-found") : ok(undefined)
}

type SoftDeleteNpcError = "npc-not-found"

/**
 * Tombstones an NPC (D4): clears the subtype's `arcana` and `lineageKey` (the
 * Lineage returns to the deck — D8) and stamps `entity.deletedAt`, in one
 * transaction. The subtype update's `(entityId, campaignId)` WHERE is the
 * write-boundary check — zero rows means a missing, already-foreign, or
 * forged id, and the entity is never touched.
 */
export async function softDeleteNpc(input: {
  campaignId: string
  entityId: string
}): Promise<Result<void, SoftDeleteNpcError>> {
  return db.transaction(async (tx) => {
    const cleared = await tx
      .update(campaignNpc)
      .set({ arcana: null, lineageKey: null })
      .where(
        and(
          eq(campaignNpc.entityId, input.entityId),
          eq(campaignNpc.campaignId, input.campaignId)
        )
      )
      .returning({ entityId: campaignNpc.entityId })
    if (cleared.length === 0) return err("npc-not-found")

    await tx
      .update(entity)
      .set({ deletedAt: new Date() })
      .where(eq(entity.id, input.entityId))

    await purgeTouchingRelations(tx, input.campaignId, "npc", input.entityId)

    return ok(undefined)
  })
}

type SoftDeleteArticleError = "article-not-found"

/**
 * Tombstones an Article (D4). The `(id, campaignId)` WHERE is the
 * write-boundary check; idempotent re-stamps are harmless. Touching
 * relations hard-delete alongside, both directions.
 */
export async function softDeleteArticle(input: {
  campaignId: string
  articleId: string
}): Promise<Result<void, SoftDeleteArticleError>> {
  return db.transaction(async (tx) => {
    const stamped = await tx
      .update(campaignArticle)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(campaignArticle.id, input.articleId),
          eq(campaignArticle.campaignId, input.campaignId)
        )
      )
      .returning({ id: campaignArticle.id })
    if (stamped.length === 0) return err("article-not-found")

    await purgeTouchingRelations(
      tx,
      input.campaignId,
      "article",
      input.articleId
    )

    return ok(undefined)
  })
}

/**
 * Hard-deletes every relation touching a tombstoned participant, **both
 * directions** (D4: relations are present-tense structure, not history — a
 * tombstone's name survives in timelines, never in the web).
 */
async function purgeTouchingRelations(
  tx: WriteExecutor,
  campaignId: string,
  kind: ParticipantKind,
  id: string
): Promise<void> {
  await tx
    .delete(campaignRelation)
    .where(
      and(
        eq(campaignRelation.campaignId, campaignId),
        or(
          and(
            eq(campaignRelation.sourceKind, kind),
            eq(campaignRelation.sourceId, id)
          ),
          and(
            eq(campaignRelation.targetKind, kind),
            eq(campaignRelation.targetId, id)
          )
        )
      )
    )
}

async function liveNpcInCampaign(
  tx: WriteExecutor,
  campaignId: string,
  entityId: string
): Promise<{ entityId: string } | undefined> {
  const [row] = await tx
    .select({ entityId: campaignNpc.entityId, deletedAt: entity.deletedAt })
    .from(campaignNpc)
    .innerJoin(entity, eq(entity.id, campaignNpc.entityId))
    .where(
      and(
        eq(campaignNpc.entityId, entityId),
        eq(campaignNpc.campaignId, campaignId)
      )
    )
  if (!row || row.deletedAt !== null) return undefined
  return { entityId: row.entityId }
}

/** True when every text field is empty and both beat lists are empty. */
function isEmptyNarrative(
  narrative: ReturnType<typeof emptyNarrative>
): boolean {
  return (
    NARRATIVE_TEXT_FIELDS.every((field) => narrative[field] === null) &&
    narrative.knives.length === 0 &&
    narrative.chains.length === 0
  )
}

/**
 * Maps the Lineage partial unique's violation to `"lineage-taken"` — the
 * concurrent double-assign the pre-check can't see (the
 * `mapScheduleRaceToOccupied` pattern).
 */
async function mapLineageRaceToTaken<T, E>(
  write: Promise<Result<T, E | "lineage-taken">>
): Promise<Result<T, E | "lineage-taken">> {
  try {
    return await write
  } catch (error) {
    if (isLineageUniqueViolation(error)) return err("lineage-taken")
    throw error
  }
}

function isLineageUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const { code, constraint } = error as { code?: string; constraint?: string }
  return (
    code === "23505" && constraint === "campaignNpc_campaign_lineage_unique"
  )
}
