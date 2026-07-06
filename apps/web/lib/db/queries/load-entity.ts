import { eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"

/**
 * Reads for the `entity` table (UNN-551). The v2-native successor of the
 * `characters`-row reads the combat durable arm used — a durable participant's
 * locator resolves an `entity` row through {@link loadEntityRowById}, and the
 * snapshot/console batch-load a whole roster through {@link loadEntityRowsByIds}.
 */

/** One entity row by id, or `null` when it doesn't exist. */
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

/** A batch of entity rows by id (order not guaranteed; callers key by `id`). */
export async function loadEntityRowsByIds(
  entityIds: readonly string[]
): Promise<EntityRow[]> {
  if (entityIds.length === 0) return []
  return db
    .select()
    .from(entity)
    .where(inArray(entity.id, [...entityIds]))
}
