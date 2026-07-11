import { and, eq, inArray, isNull } from "drizzle-orm"

import { db } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"

/**
 * Reads for the `entity` table (UNN-551). The v2-native successor of the
 * `characters`-row reads the combat durable arm used — a durable participant's
 * locator resolves an `entity` row through {@link loadEntityRowById}, and the
 * snapshot/console batch-load a whole roster through {@link loadEntityRowsByIds}.
 *
 * **Soft-delete split (R1 — UNN-571).** "Does a tombstone resolve here?" has
 * three answers, keyed to *why* the caller holds the id — not by id-vs-shortId:
 *
 * 1. **Identity / discovery (by `shortId`) → filter.**
 *    {@link loadEntityRowByShortId} adds `deletedAt IS NULL` so a public-URL load
 *    404s and the row leaves every list.
 * 2. **Live occupancy / setup (by id, from *current* state or client input) →
 *    filter.** {@link loadLiveEntityRowById} / {@link loadLiveEntityRowsByIds}:
 *    the id comes from dungeon Instance occupancy or a client-supplied combat
 *    setup, so a tombstone must read as *absent* — else a deleted PC lingers on a
 *    delve surface or gets wired into a *new* fight (the exact hole the Codex
 *    review on PR #331 named). These reads decide, right now, to *show* or *add*
 *    a character; a tombstone is not eligible.
 * 3. **Pinned persisted locator (by id, from a stored encounter session) →
 *    blind.** {@link loadEntityRowById} / {@link loadEntityRowsByIds} hydrate an
 *    id already committed into a stored session blob (the combat durable arm, the
 *    watch snapshot). Dropping it to `null` would surface as a `missing-durable`
 *    dangling ref, 404ing a whole in-progress fight — the opposite of "history
 *    survives its subjects" (D4). The live-encounter lock keeps tombstones out of
 *    live fights, so blindness here is safe by construction. The auth gates
 *    ({@link import("@/lib/auth/campaign-access")}) read blind for the same
 *    reason, now through the PC-subtype join (`loadPlayerCharacterById`, R3 —
 *    UNN-573): they authorize by ownership, and the discovery filter already
 *    denies every surface a write path to a tombstone.
 */

/**
 * One entity row by id, or `null` when it doesn't exist. **`deletedAt`-blind**
 * (module note, case 3) — for pinned persisted-locator hydration and auth gates,
 * never a live occupancy/setup read (use {@link loadLiveEntityRowById}).
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
 * One **live** entity row by id (`deletedAt IS NULL`), or `null` when it doesn't
 * exist or is a tombstone (module note, case 2). For by-id reads resolving
 * *current* state or client input — dungeon occupancy, combat setup adds — where
 * a deleted character must read as absent.
 */
export async function loadLiveEntityRowById(
  entityId: string
): Promise<EntityRow | null> {
  const [row] = await db
    .select()
    .from(entity)
    .where(and(eq(entity.id, entityId), isNull(entity.deletedAt)))
    .limit(1)
  return row ?? null
}

/**
 * One live entity row by its public `shortId` (the `/characters/{shortId}/builder`
 * and `/characters/{shortId}` route key), or `null` when it doesn't exist **or is
 * soft-deleted** — the tombstone-404 boundary (module note, case 1).
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
 * **`deletedAt`-blind** (module note, case 3) — pinned persisted-locator
 * hydration only; use {@link loadLiveEntityRowsByIds} for occupancy/setup reads.
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

/**
 * A batch of **live** entity rows by id (`deletedAt IS NULL`; order not
 * guaranteed, callers key by `id`) — the live-only twin of
 * {@link loadEntityRowsByIds} (module note, case 2). Tombstones are simply
 * absent from the result, so an occupancy-derived roster read omits a deleted
 * character.
 */
export async function loadLiveEntityRowsByIds(
  entityIds: readonly string[]
): Promise<EntityRow[]> {
  if (entityIds.length === 0) return []
  return db
    .select()
    .from(entity)
    .where(and(inArray(entity.id, [...entityIds]), isNull(entity.deletedAt)))
}
