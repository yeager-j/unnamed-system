import { eq } from "drizzle-orm"

import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "@workspace/game-v2/generation"
import { type Result } from "@workspace/result"

import { db, type WriteExecutor } from "@/lib/db/client"
import { templateSets } from "@/lib/db/schema/template-set"
import { insertWithShortId } from "@/lib/db/short-id"
import { guardedVersionUpdate } from "@/lib/db/writes/guarded-update"

/**
 * Persistence for the `templateSet` table — the user-owned authoring library
 * (Procedural Dungeons PRD, *Template Sets*). Like the Map wrappers this is
 * auth-free; the owner authorization (`requireTemplateSetOwner`) lives at the
 * Server Action boundary that calls it.
 *
 * A single `version` token guards every content/name mutation through the shared
 * {@link guardedVersionUpdate}. The Headcanon command supplies its attempt
 * transaction and the version it just loaded; standalone callers may use `db`.
 */

type TemplateSetWriteError = "template-set-not-found" | "stale"

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
 * Stores content produced by reducing target-scoped events over the authority
 * attempt's current row, guarded by that row's observed version. A lost guard is
 * command contention, never a client-visible stale result.
 */
export async function saveTemplateSetContent(
  templateSetId: string,
  content: TemplateSetContent,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return bumpTemplateSetVersionGuarded(
    templateSetId,
    expectedVersion,
    {
      content,
    },
    executor
  )
}

/**
 * The guarded name Store. Name and content share one row version, while the
 * Headcanon root owns client ordering and the authority owns contention retry.
 */
export async function renameTemplateSet(
  templateSetId: string,
  name: string,
  expectedVersion: number,
  executor: WriteExecutor = db
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return bumpTemplateSetVersionGuarded(
    templateSetId,
    expectedVersion,
    { name },
    executor
  )
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

/** The shared single-version guard, bound to this aggregate's table + error. */
async function bumpTemplateSetVersionGuarded(
  templateSetId: string,
  expectedVersion: number,
  patch: Partial<typeof templateSets.$inferInsert>,
  executor: WriteExecutor
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return guardedVersionUpdate({
    table: templateSets,
    id: templateSetId,
    expectedVersion,
    patch,
    notFound: "template-set-not-found",
    executor,
  })
}
