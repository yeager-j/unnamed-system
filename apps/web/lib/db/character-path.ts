import { and, eq, sql } from "drizzle-orm"

import type { PathChoice } from "../game/character"
import { err, ok, type Result } from "../result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters } from "./schema/character"

/**
 * Persistence for the builder's HP/SP path choice. Conditions on
 * `(id, identityVersion)` so a concurrent identity-class write surfaces
 * `"stale"` rather than silently overwriting; the column is bumped atomically
 * in the same `SET` clause. Mirrors {@link updateCharacterName}; see
 * `lib/actions/README.md` for the broader pattern.
 *
 * `pathChoice` belongs to the identity-class version namespace because every
 * write the wizard makes (name, pronouns, portrait, builder step, path,
 * origin Archetype) is a builder-time configuration choice that naturally
 * serializes through one counter.
 */

export type CharacterPathPersistenceError = "character-not-found" | "stale"

export interface CharacterPathPersistenceSuccess {
  pathChoice: PathChoice
  version: number
}

export async function updateCharacterPath(
  characterId: string,
  pathChoice: PathChoice,
  expectedVersion: number
): Promise<
  Result<CharacterPathPersistenceSuccess, CharacterPathPersistenceError>
> {
  const updated = await db
    .update(characters)
    .set({
      pathChoice,
      identityVersion: sql`${characters.identityVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(characters.id, characterId),
        eq(characters.identityVersion, expectedVersion)
      )
    )
    .returning({
      pathChoice: characters.pathChoice,
      identityVersion: characters.identityVersion,
    })

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  const [row] = updated
  return ok({ pathChoice: row!.pathChoice, version: row!.identityVersion })
}
