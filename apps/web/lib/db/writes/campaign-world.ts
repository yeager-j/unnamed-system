import { and, eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import { db } from "@/lib/db/client"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import {
  campaignArticle,
  campaignNpc,
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

    return ok(undefined)
  })
}

type SoftDeleteArticleError = "article-not-found"

/**
 * Tombstones an Article (D4). The `(id, campaignId)` WHERE is the
 * write-boundary check; idempotent re-stamps are harmless.
 */
export async function softDeleteArticle(input: {
  campaignId: string
  articleId: string
}): Promise<Result<void, SoftDeleteArticleError>> {
  const stamped = await db
    .update(campaignArticle)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(campaignArticle.id, input.articleId),
        eq(campaignArticle.campaignId, input.campaignId)
      )
    )
    .returning({ id: campaignArticle.id })
  return stamped.length === 0 ? err("article-not-found") : ok(undefined)
}
