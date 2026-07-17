import { eq } from "drizzle-orm"

import {
  templateSetContentSchema,
  type TemplateSetContent,
} from "@workspace/game-v2/generation"
import { type Result } from "@workspace/result"

import { db } from "@/lib/db/client"
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
 * {@link guardedVersionUpdate}. These run on the base `db` — Set authoring is
 * single-owner with no cross-row atomic gesture (no `guardMany`).
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
 * The guarded content write: replaces the whole `content` blob and bumps
 * `version`, conditioned on the caller's `expectedVersion`. Returns the new
 * version on success. This is the write the Set editor's autosave calls on every
 * template/table/knob edit.
 */
export async function saveTemplateSetContent(
  templateSetId: string,
  content: TemplateSetContent,
  expectedVersion: number
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return bumpTemplateSetVersionGuarded(templateSetId, expectedVersion, {
    content,
  })
}

/**
 * The guarded name write — the autosaved Set name (no Save button). Same guarded
 * primitive as {@link saveTemplateSetContent}, different patch: name and content
 * share the one `version` token, each round-tripping it on its own save.
 */
export async function renameTemplateSet(
  templateSetId: string,
  name: string,
  expectedVersion: number
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return bumpTemplateSetVersionGuarded(templateSetId, expectedVersion, { name })
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
  patch: Partial<typeof templateSets.$inferInsert>
): Promise<Result<{ version: number }, TemplateSetWriteError>> {
  return guardedVersionUpdate({
    table: templateSets,
    id: templateSetId,
    expectedVersion,
    patch,
    notFound: "template-set-not-found",
  })
}
