import type { PathChoice } from "../game/character"
import { ok, type Result } from "../result"
import { db } from "./index"
import { bumpCharacterVersionGuarded } from "./version-guard"

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
  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "identity",
    expectedVersion,
    { pathChoice }
  )
  if (!result.ok) return result

  return ok({ pathChoice, version: result.value.version })
}
