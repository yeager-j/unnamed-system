import { and, asc, eq, max, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characterChains, characters } from "./schema/character"

/**
 * Persistence for the Step-3 Chains repeating list (rulebook 1.4; one
 * `characterChain` row per entry, ordered by `order`). Structurally
 * identical to `character-knives.ts` — same identity-class bump,
 * same child-table transactional pattern. They're left as parallel files
 * rather than abstracted behind a shared helper because (a) it keeps each
 * domain's column-name story local and obvious and (b) the lists are
 * intentionally independent (rulebook 1.4 contrasts the external/internal
 * shape; the schemas are likely to diverge if either grows fields like
 * "broken" or "linked Knife").
 */

export type CharacterChainPersistenceError =
  | "character-not-found"
  | "chain-not-found"
  | "stale"

export interface CharacterChainPersistenceSuccess {
  version: number
}

export interface AddChainSuccess extends CharacterChainPersistenceSuccess {
  id: string
  order: number
}

export async function addCharacterChain(
  characterId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<Result<AddChainSuccess, CharacterChainPersistenceError>> {
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
      .select({ value: max(characterChains.order) })
      .from(characterChains)
      .where(eq(characterChains.characterId, characterId))

    const nextOrder = (maxRow?.value ?? -1) + 1

    const [inserted] = await tx
      .insert(characterChains)
      .values({
        characterId,
        title,
        description: description?.trim().length ? description : null,
        order: nextOrder,
      })
      .returning({ id: characterChains.id, order: characterChains.order })

    return ok({
      id: inserted!.id,
      order: inserted!.order,
      version: bumped.identityVersion,
    })
  })
}

export async function updateCharacterChain(
  characterId: string,
  chainId: string,
  title: string,
  description: string | null,
  expectedVersion: number
): Promise<
  Result<CharacterChainPersistenceSuccess, CharacterChainPersistenceError>
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
      .update(characterChains)
      .set({
        title,
        description: description?.trim().length ? description : null,
      })
      .where(
        and(
          eq(characterChains.id, chainId),
          eq(characterChains.characterId, characterId)
        )
      )
      .returning({ id: characterChains.id })

    if (updated.length === 0) return err("chain-not-found")

    return ok({ version: bumped.identityVersion })
  })
}

export async function removeCharacterChain(
  characterId: string,
  chainId: string,
  expectedVersion: number
): Promise<
  Result<CharacterChainPersistenceSuccess, CharacterChainPersistenceError>
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
      .delete(characterChains)
      .where(
        and(
          eq(characterChains.id, chainId),
          eq(characterChains.characterId, characterId)
        )
      )
      .returning({ id: characterChains.id })

    if (removed.length === 0) return err("chain-not-found")

    return ok({ version: bumped.identityVersion })
  })
}

export async function loadCharacterChains(characterId: string) {
  return db
    .select()
    .from(characterChains)
    .where(eq(characterChains.characterId, characterId))
    .orderBy(asc(characterChains.order))
}
