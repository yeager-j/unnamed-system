import { ok, type Result } from "../result"
import { db } from "./index"
import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the trivial character-name update (no engine transition).
 * Conditions on `(id, identityVersion)` so a concurrent identity-class write
 * surfaces `"stale"` rather than silently overwriting; an independent edit in
 * a different class (vitals, inventory, progression) bumps a different column
 * and does not affect this save's version match. Per-write-class versioning
 * is the UNN-140 baseline every wrapper follows; see `lib/actions/README.md`.
 */

/**
 * The failure cases this layer surfaces: the id matched no character, or the
 * row's `identityVersion` no longer equals the caller's `expectedVersion`
 * because a concurrent identity-class write landed first.
 */
export type CharacterNamePersistenceError = "character-not-found" | "stale"

export interface CharacterNamePersistenceSuccess {
  name: string
  version: number
}

/**
 * Updates `name` on the character with `characterId`, but only if the row's
 * current `identityVersion` matches `expectedVersion`. Returns the fresh
 * `name` and bumped `version` so the client can chain subsequent saves
 * without a re-fetch.
 */
export async function updateCharacterName(
  characterId: string,
  name: string,
  expectedVersion: number
): Promise<
  Result<CharacterNamePersistenceSuccess, CharacterNamePersistenceError>
> {
  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    "identity",
    expectedVersion,
    { name }
  )
  if (!result.ok) return result

  return ok({ name, version: result.value.version })
}
