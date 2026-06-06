import { ok, type Result } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS, type EditSurface } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for identity-class character writes that don't belong to a
 * dedicated engine module — pronouns, portrait pointer, builder-step
 * cursor. Each function conditions on `(id, identityVersion)` so a
 * concurrent identity-class write surfaces `"stale"` rather than silently
 * overwriting; the column is bumped atomically in the same `SET` clause.
 * See `lib/actions/README.md` for the broader pattern and `character-name.ts`
 * for the original reference implementation.
 */

export type CharacterIdentityPersistenceError = "character-not-found" | "stale"

export interface CharacterIdentityPersistenceSuccess {
  version: number
}

/**
 * Updates the `pronouns` text. Empty input is normalized to `null` so the
 * column stays a clean "set vs. unset" rather than discriminating empty
 * strings vs. nulls downstream.
 */
export async function updateCharacterPronouns(
  characterId: string,
  pronouns: string,
  expectedVersion: number
): Promise<
  Result<CharacterIdentityPersistenceSuccess, CharacterIdentityPersistenceError>
> {
  return runIdentityUpdate(characterId, expectedVersion, "pronouns", {
    pronouns: pronouns.length === 0 ? null : pronouns,
  })
}

/**
 * Points `portraitUrl` at the freshly-uploaded Blob URL. The previous Blob
 * object (if any) is left in storage — see `RemoveCharacterPortraitSchema`'s
 * JSDoc for the rationale.
 */
export async function updateCharacterPortraitUrl(
  characterId: string,
  portraitUrl: string,
  expectedVersion: number
): Promise<
  Result<CharacterIdentityPersistenceSuccess, CharacterIdentityPersistenceError>
> {
  return runIdentityUpdate(characterId, expectedVersion, "portrait", {
    portraitUrl,
  })
}

/**
 * Clears `portraitUrl` (falls back to the avatar placeholder). The Blob
 * object is intentionally orphaned, same rationale as the update path.
 */
export async function clearCharacterPortrait(
  characterId: string,
  expectedVersion: number
): Promise<
  Result<CharacterIdentityPersistenceSuccess, CharacterIdentityPersistenceError>
> {
  return runIdentityUpdate(characterId, expectedVersion, "portrait", {
    portraitUrl: null,
  })
}

/**
 * Bumps the `builderStep` cursor monotonically — accepts both forward
 * (Next) and backward (Back) navigation, since the wizard wants the cursor
 * to reflect "where the player currently is" rather than "the high-water
 * mark." The card on My Characters reads this so "Resume building"
 * deep-links to the same step the user left.
 */
export async function setCharacterBuilderStep(
  characterId: string,
  step: number,
  expectedVersion: number
): Promise<
  Result<CharacterIdentityPersistenceSuccess, CharacterIdentityPersistenceError>
> {
  return runIdentityUpdate(characterId, expectedVersion, "builderStep", {
    builderStep: step,
  })
}

async function runIdentityUpdate(
  characterId: string,
  expectedVersion: number,
  surface: EditSurface,
  patch: Partial<
    Pick<
      typeof characters.$inferInsert,
      "pronouns" | "portraitUrl" | "builderStep"
    >
  >
): Promise<
  Result<CharacterIdentityPersistenceSuccess, CharacterIdentityPersistenceError>
> {
  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS[surface],
    expectedVersion,
    patch
  )
  if (!result.ok) return result

  return ok({ version: result.value.version })
}
