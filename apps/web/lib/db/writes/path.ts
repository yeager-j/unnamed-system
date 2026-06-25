import { ok, type PathChoice, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the builder's HP/SP path choice. Conditions on
 * `(id, identityVersion)` so a concurrent identity-class write surfaces
 * `"stale"` rather than silently overwriting; the column is bumped atomically
 * in the same `SET` clause. Mirrors {@link updateCharacterName}; see
 * `lib/actions/CLAUDE.md` for the broader pattern.
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
    EDIT_SURFACE_CLASS.path,
    expectedVersion,
    { pathChoice }
  )
  if (!result.ok) return result

  return ok({ pathChoice, version: result.value.version })
}
