import { eq } from "drizzle-orm"

import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "@workspace/game-v2/generation"
import { type Result } from "@workspace/result"

import { db } from "@/lib/db/client"
import { templateSets } from "@/lib/db/schema/template-set"
import { insertWithShortId } from "@/lib/db/short-id"
import { lastWriterWinsUpdate } from "@/lib/db/writes/last-writer-wins-update"

/**
 * Persistence for the `templateSet` table — the user-owned authoring library
 * (Procedural Dungeons PRD, *Template Sets*). Like the Map wrappers this is
 * auth-free; the owner authorization (`requireTemplateSetOwner`) lives at the
 * Server Action boundary that calls it.
 *
 * Set authoring is single-owner and each autosave patches one field, so writes
 * use deliberate last-writer-wins concurrency. The row's `version` remains an
 * authority-owned revision counter so an older, still-open versioned client
 * fails stale instead of overlooking a new LWW write during deployment overlap.
 * Current write commands neither send nor return it.
 */

type TemplateSetWriteError = "template-set-not-found"

/**
 * Creates an empty Template Set owned by `userId` with a minted, collision-retried
 * `shortId` (the editor URL). Content starts as the parsed empty set
 * (`templateSetContentSchema.parse({})` — a valid set with no templates/tables);
 * the editor autosaves templates/tables into it. Returns the new `id` + `shortId`
 * so the action can redirect to `/stage/sets/{shortId}` (mirrors `createMap`).
 */
export async function createTemplateSet(input: {
  userId: string
  name: string
}): Promise<{ id: string; shortId: string }> {
  return insertWithShortId(async (shortId) => {
    const [row] = await db
      .insert(templateSets)
      .values({
        shortId,
        userId: input.userId,
        name: input.name,
        content: templateSetContentSchema.parse({}),
      })
      .returning({ id: templateSets.id, shortId: templateSets.shortId })

    return row!
  })
}

/**
 * Replaces the whole `content` blob and advances the row revision. This is the
 * write the Set editor's autosave calls on every template/table/knob edit.
 */
export async function saveTemplateSetContent(
  templateSetId: string,
  content: TemplateSetContent
): Promise<Result<void, TemplateSetWriteError>> {
  return updateTemplateSet(templateSetId, {
    content,
  })
}

/**
 * The autosaved Set name (no Save button). Same per-field LWW primitive as
 * {@link saveTemplateSetContent}, different patch.
 */
export async function renameTemplateSet(
  templateSetId: string,
  name: string
): Promise<Result<void, TemplateSetWriteError>> {
  return updateTemplateSet(templateSetId, { name })
}

/**
 * Soft-deletes a Template Set — an **unguarded** `SET deletedAt = new Date()`
 * (house convention, like `dungeon.deletedAt`), not the hard delete Maps use. A
 * `new Date()` timestamp (not `sql\`now()\``) because a soft delete is a plain
 * marker the app compares against, and the ms-vs-μs mismatch between JS `Date`
 * and Postgres `now()` causes false optimistic-concurrency stales elsewhere — so
 * the app mints the timestamp it will read back.
 *
 * Unguarded because a soft delete is idempotent and last-writer-wins is correct
 * (deleting an already-deleted set is a no-op). Every read filters
 * `deletedAt IS NULL`, so the row simply drops out of the product.
 */
export async function softDeleteTemplateSet(
  templateSetId: string
): Promise<void> {
  await db
    .update(templateSets)
    .set({ deletedAt: new Date() })
    .where(eq(templateSets.id, templateSetId))
}

async function updateTemplateSet(
  templateSetId: string,
  patch: Partial<typeof templateSets.$inferInsert>
): Promise<Result<void, TemplateSetWriteError>> {
  return lastWriterWinsUpdate({
    table: templateSets,
    id: templateSetId,
    patch,
    notFound: "template-set-not-found",
  })
}
