import { and, desc, eq, isNull } from "drizzle-orm"

import { templateSetContentSchema } from "@workspace/game-v2/generation"

import { db } from "@/lib/db/client"
import { templateSets, type TemplateSetRow } from "@/lib/db/schema/template-set"

/**
 * Reads for the `templateSet` table — the user-owned authoring library
 * (Procedural Dungeons PRD, *Template Sets*). Like the Map loader, the jsonb
 * `content` is parsed through {@link templateSetContentSchema} on read so zod
 * defaults run (and its order-array reconcile heals) — a blob persisted before a
 * field existed can't reach a caller with that field `undefined`. These back the
 * owner gate (`requireTemplateSetOwner`), the Sets list, and the editor route.
 *
 * Every read filters `deletedAt IS NULL`: a soft-deleted set is gone from the
 * product (the row survives only so a future `region.templateSetId` restrict FK
 * has a tombstone to point at).
 */
function withParsedContent(row: TemplateSetRow): TemplateSetRow {
  return { ...row, content: templateSetContentSchema.parse(row.content) }
}

/** The live `templateSet` row by id (content parsed), or `null` when none matches
 *  or it is soft-deleted. Backs
 *  {@link import("@/lib/auth/template-set-access").requireTemplateSetOwner}. */
export async function loadTemplateSetRowById(
  templateSetId: string
): Promise<TemplateSetRow | null> {
  const [row] = await db
    .select()
    .from(templateSets)
    .where(
      and(eq(templateSets.id, templateSetId), isNull(templateSets.deletedAt))
    )
    .limit(1)

  return row ? withParsedContent(row) : null
}

/** The live `templateSet` row by public `shortId` (the editor URL), or `null`
 *  when none matches or it is soft-deleted. */
export async function loadTemplateSetByShortId(
  shortId: string
): Promise<TemplateSetRow | null> {
  const [row] = await db
    .select()
    .from(templateSets)
    .where(
      and(eq(templateSets.shortId, shortId), isNull(templateSets.deletedAt))
    )
    .limit(1)

  return row ? withParsedContent(row) : null
}

/** Every live Template Set owned by `userId`, newest first — the Sets list. */
export async function loadTemplateSetsByUserId(
  userId: string
): Promise<TemplateSetRow[]> {
  const rows = await db
    .select()
    .from(templateSets)
    .where(and(eq(templateSets.userId, userId), isNull(templateSets.deletedAt)))
    .orderBy(desc(templateSets.createdAt))

  return rows.map(withParsedContent)
}

/**
 * A Set flattened for the Region wandering-table picker (UNN-589): the Set's
 * public `shortId` + `name`, and its content tables projected to `{ key, name }`
 * in authored order (`tableOrder`). The Region UI lives in the app tier, which is
 * gated against `@workspace/game*`, so the picker can't reach into `content` itself
 * — this loader-adjacent projection does the game-v2 read on its behalf and hands
 * back the plain shape both the create dialog and the settings form pass as props.
 */
export interface PickableSet {
  shortId: string
  name: string
  tables: { key: string; name: string }[]
}

/** Projects a parsed {@link TemplateSetRow} to the {@link PickableSet} the
 *  wandering-table picker renders. Walks `tableOrder` (already reconciled against
 *  `tables` on parse) so the options follow the authored sequence. */
export function projectSetForPicker(row: TemplateSetRow): PickableSet {
  return {
    shortId: row.shortId,
    name: row.name,
    tables: row.content.tableOrder.map((key) => ({
      key,
      name: row.content.tables[key]!.name,
    })),
  }
}
