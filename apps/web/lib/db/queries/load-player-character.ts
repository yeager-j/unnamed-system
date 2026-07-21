import { and, eq, inArray, isNull } from "drizzle-orm"

import { db, type WriteExecutor } from "@/lib/db/client"
import { entity, type EntityRow } from "@/lib/db/schema/entity"
import {
  playerCharacter,
  type PlayerCharacterRow,
} from "@/lib/db/schema/player-character"

/**
 * Reads over the **player-character subtype** (R3 — UNN-573): a `playerCharacter`
 * row joined with the `entity` substrate it specializes, or the subtype row alone.
 * These are the PC-scoped reads — every one either returns the subtype row or joins
 * it — as opposed to `load-entity.ts`'s kind-agnostic substrate reads (the combat
 * pinned-locator / occupancy hydration, which must not require a PC subtype).
 *
 * The joined reads inherit the soft-delete discipline of `load-entity.ts` (module
 * note there): the by-`shortId` discovery read and the by-ids live read filter
 * `deletedAt IS NULL`; the subtype-only reads that feed the auth gates and the
 * pinned watch snapshot stay `deletedAt`-blind.
 */

/**
 * A loaded player character: its own `playerCharacter` row (owner / placement /
 * lifecycle), carrying the `entity` **substrate** it specializes at `.entity`. The
 * PC is the self; the entity is a part it *has*, not a peer — hence the spread.
 */
export type LoadedPlayerCharacter = PlayerCharacterRow & { entity: EntityRow }

/** Reshapes a joined `{ entity, pc }` row into the {@link LoadedPlayerCharacter}
 *  spread shape. */
function toLoadedPlayerCharacter(row: {
  entity: EntityRow
  pc: PlayerCharacterRow
}): LoadedPlayerCharacter {
  return { ...row.pc, entity: row.entity }
}

/**
 * One player character by its public `shortId` (the `/characters/{shortId}` route
 * key), or `null` when no live PC has it — the tombstone-404 boundary
 * (`deletedAt IS NULL`). The one load the character read side (`domain/character/
 * load.ts`) mounts.
 */
export async function loadPlayerCharacterByShortId(
  shortId: string
): Promise<LoadedPlayerCharacter | null> {
  const [row] = await db
    .select({ entity, pc: playerCharacter })
    .from(entity)
    .innerJoin(playerCharacter, eq(playerCharacter.entityId, entity.id))
    .where(and(eq(entity.shortId, shortId), isNull(entity.deletedAt)))
    .limit(1)
  return row ? toLoadedPlayerCharacter(row) : null
}

/**
 * A batch of **live** player characters by entity id (order not guaranteed;
 * callers key by `entity.id`) — the own-sheet column of the dungeon watch
 * (UNN-566), whose ids are Instance occupancy, so a tombstone must read as absent.
 */
export async function loadLivePlayerCharactersByIds(
  entityIds: readonly string[]
): Promise<LoadedPlayerCharacter[]> {
  if (entityIds.length === 0) return []
  const rows = await db
    .select({ entity, pc: playerCharacter })
    .from(entity)
    .innerJoin(playerCharacter, eq(playerCharacter.entityId, entity.id))
    .where(and(inArray(entity.id, [...entityIds]), isNull(entity.deletedAt)))
  return rows.map(toLoadedPlayerCharacter)
}

/**
 * One player character by entity id, or `null` when no PC subtype specializes it.
 * **`deletedAt`-blind** — for the auth gates, which authorize by ownership over a
 * pinned id (the discovery filter already denies every surface a write path to a
 * tombstone) and hand the loaded PC back so the caller doesn't re-query.
 *
 * Accepts an optional `executor` so the transactional entity handler can read the
 * authorization row inside its own attempt's snapshot (UNN-674); defaults to the
 * standalone `db` client for every other caller.
 */
export async function loadPlayerCharacterById(
  entityId: string,
  executor: WriteExecutor = db
): Promise<LoadedPlayerCharacter | null> {
  const [row] = await executor
    .select({ entity, pc: playerCharacter })
    .from(entity)
    .innerJoin(playerCharacter, eq(playerCharacter.entityId, entity.id))
    .where(eq(entity.id, entityId))
    .limit(1)
  return row ? toLoadedPlayerCharacter(row) : null
}

/**
 * A batch of player-character subtype rows by entity id (order not guaranteed;
 * callers key by `entityId`). **`deletedAt`-blind** — feeds the owned-combatant
 * watch snapshot (whose ids are a pinned encounter locator) and the durable
 * combatants' owner map, which need the subtype row without the substrate.
 */
export async function loadPlayerCharacterRowsByIds(
  entityIds: readonly string[]
): Promise<PlayerCharacterRow[]> {
  if (entityIds.length === 0) return []
  return db
    .select()
    .from(playerCharacter)
    .where(inArray(playerCharacter.entityId, [...entityIds]))
}
