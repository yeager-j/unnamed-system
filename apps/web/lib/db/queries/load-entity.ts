import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"

/**
 * Reads for the `entity` table (UNN-551). The v2-native successor of the
 * `characters`-row reads the combat durable arm used — a durable participant's
 * locator resolves an `entity` row through {@link loadEntityRowById}, and the
 * snapshot/console batch-load a whole roster through {@link loadEntityRowsByIds}.
 *
 * **Soft-delete split (R1 — UNN-571):** only {@link loadEntityRowByShortId} — the
 * public-URL / identity boundary — filters `deletedAt IS NULL`, so a tombstoned
 * entity 404s. The **by-id** reads ({@link loadEntityRowById} /
 * {@link loadEntityRowsByIds}) stay `deletedAt`-blind on purpose: their callers
 * hold an id already pinned by a stored encounter session/locator (the combat
 * durable arm, the dungeon snapshot) or by an auth gate, and a live encounter
 * can't reference a tombstone (the delete flow's live-encounter lock). Dropping
 * a pinned id to `null` here would surface as a `missing-durable` dangling ref,
 * 404ing a whole in-progress fight — the opposite of "history survives its
 * subjects" (D4).
 */

/**
 * One entity row by id, or `null` when it doesn't exist. **`deletedAt`-blind** —
 * see the module note: id callers resolve pinned references and auth gates, not
 * discovery surfaces.
 */
export async function loadEntityRowById(
  entityId: string
): Promise<EntityRow | null> {
  const [row] = await db
    .select()
    .from(entity)
    .where(eq(entity.id, entityId))
    .limit(1)
  return row ?? null
}

/**
 * One live entity row by its public `shortId` (the `/characters/{shortId}/builder`
 * and `/characters/{shortId}` route key), or `null` when it doesn't exist **or is
 * soft-deleted** — the tombstone-404 boundary (R1). The by-id reads stay blind;
 * this identity/discovery read does not.
 */
export async function loadEntityRowByShortId(
  shortId: string
): Promise<EntityRow | null> {
  const [row] = await db
    .select()
    .from(entity)
    .where(and(eq(entity.shortId, shortId), isNull(entity.deletedAt)))
    .limit(1)
  return row ?? null
}

/**
 * A batch of entity rows by id (order not guaranteed; callers key by `id`).
 * **`deletedAt`-blind** — see the module note.
 */
export async function loadEntityRowsByIds(
  entityIds: readonly string[]
): Promise<EntityRow[]> {
  if (entityIds.length === 0) return []
  return db
    .select()
    .from(entity)
    .where(inArray(entity.id, [...entityIds]))
}
