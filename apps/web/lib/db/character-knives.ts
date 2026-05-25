import { and, asc, eq, max, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characterKnives, characters } from "./schema/character"

/**
 * Persistence for the Step-3 Knives repeating list (rulebook 1.4; one
 * `characterKnife` row per entry, ordered by `order`). Identity-class:
 * every mutation conditionally bumps `identityVersion` first inside a
 * transaction (row lock acts as the gate), then writes / deletes the
 * child row — same shape as `inventory.ts` so a concurrent identity-class
 * write surfaces `"stale"` rather than silently dropping the entry.
 */

export type CharacterKnifePersistenceError =
  | "character-not-found"
  | "knife-not-found"
  | "stale"

export interface CharacterKnifePersistenceSuccess {
  version: number
}

export interface AddKnifeSuccess extends CharacterKnifePersistenceSuccess {
  id: string
  order: number
}

/**
 * Appends a new knife to the end of the list. The `order` value is one
 * more than the current `MAX(order)` for the character, computed inside
 * the same transaction so two parallel adds don't collide on the same
 * position. Returns the generated id + order so the client can render the
 * new row immediately.
 */
export async function addCharacterKnife(
  characterId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<AddKnifeSuccess, CharacterKnifePersistenceError>> {
  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
        identityVersion: sql`${characters.identityVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.identityVersion, expectedVersion)
        )
      )
      .returning({ identityVersion: characters.identityVersion })

    if (!bumped) {
      return (await characterExists(characterId))
        ? err("stale")
        : err("character-not-found")
    }

    const [maxRow] = await tx
      .select({ value: max(characterKnives.order) })
      .from(characterKnives)
      .where(eq(characterKnives.characterId, characterId))

    const nextOrder = (maxRow?.value ?? -1) + 1

    const [inserted] = await tx
      .insert(characterKnives)
      .values({
        characterId,
        title,
        description: description?.trim().length ? description : null,
        order: nextOrder,
      })
      .returning({ id: characterKnives.id, order: characterKnives.order })

    return ok({
      id: inserted!.id,
      order: inserted!.order,
      version: bumped.identityVersion,
    })
  })
}

/**
 * Updates the title and/or description of an existing knife. Both columns
 * are written every call; the caller passes the full row state. Trimmed
 * empty descriptions normalize to `null` so the column stays a clean
 * set/unset.
 */
export async function updateCharacterKnife(
  characterId: string,
  knifeId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<
  Result<CharacterKnifePersistenceSuccess, CharacterKnifePersistenceError>
> {
  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
        identityVersion: sql`${characters.identityVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.identityVersion, expectedVersion)
        )
      )
      .returning({ identityVersion: characters.identityVersion })

    if (!bumped) {
      return (await characterExists(characterId))
        ? err("stale")
        : err("character-not-found")
    }

    const updated = await tx
      .update(characterKnives)
      .set({
        title,
        description: description?.trim().length ? description : null,
      })
      .where(
        and(
          eq(characterKnives.id, knifeId),
          eq(characterKnives.characterId, characterId)
        )
      )
      .returning({ id: characterKnives.id })

    if (updated.length === 0) return err("knife-not-found")

    return ok({ version: bumped.identityVersion })
  })
}

/**
 * Removes a knife. Idempotent only in the sense that re-running it on an
 * already-removed id surfaces `knife-not-found` rather than silently
 * succeeding — the caller can treat that as "already gone" if it wants
 * undo semantics.
 */
export async function removeCharacterKnife(
  characterId: string,
  knifeId: string,
  expectedVersion: number
): Promise<
  Result<CharacterKnifePersistenceSuccess, CharacterKnifePersistenceError>
> {
  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
        identityVersion: sql`${characters.identityVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characters.id, characterId),
          eq(characters.identityVersion, expectedVersion)
        )
      )
      .returning({ identityVersion: characters.identityVersion })

    if (!bumped) {
      return (await characterExists(characterId))
        ? err("stale")
        : err("character-not-found")
    }

    const removed = await tx
      .delete(characterKnives)
      .where(
        and(
          eq(characterKnives.id, knifeId),
          eq(characterKnives.characterId, characterId)
        )
      )
      .returning({ id: characterKnives.id })

    if (removed.length === 0) return err("knife-not-found")

    return ok({ version: bumped.identityVersion })
  })
}

/**
 * Lightweight reader used by the builder loader to fold knives into the
 * memoized character fetch. Sorted by `order` so display matches the
 * canonical insertion order.
 */
export async function loadCharacterKnives(characterId: string) {
  return db
    .select()
    .from(characterKnives)
    .where(eq(characterKnives.characterId, characterId))
    .orderBy(asc(characterKnives.order))
}
