import { db } from "@/lib/db/client"
import { characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"
import { ok, type Result } from "@/lib/result"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * Persistence for the five Step-4 Identity Trait columns (rulebook 1.5,
 * PRD §5.1 step 4): Personality Traits, Hopes, Dreams, Fears, Secrets.
 *
 * Each is one Markdown `text` column, written through the identity write
 * class — bumps `identityVersion` and conditions on `expectedVersion` the
 * same way as `character-narrative.ts` (the structural parent of this
 * module). Trimmed-empty text normalizes to `null` so the column stays
 * "set vs. unset" rather than mixing nulls and empty strings downstream.
 */

export type CharacterIdentityTraitPersistenceError =
  | "character-not-found"
  | "stale"

export interface CharacterIdentityTraitPersistenceSuccess {
  version: number
}

export const IDENTITY_TRAIT_FIELDS = [
  "personality",
  "hope",
  "dream",
  "fear",
  "secret",
] as const

export type IdentityTraitField = (typeof IDENTITY_TRAIT_FIELDS)[number]

const COLUMN_FOR_FIELD = {
  personality: "personalityTraits",
  hope: "hopes",
  dream: "dreams",
  fear: "fears",
  secret: "secrets",
} as const satisfies Record<
  IdentityTraitField,
  keyof typeof characters.$inferInsert
>

export async function updateCharacterIdentityTrait(
  characterId: string,
  field: IdentityTraitField,
  text: string,
  expectedVersion: number
): Promise<
  Result<
    CharacterIdentityTraitPersistenceSuccess,
    CharacterIdentityTraitPersistenceError
  >
> {
  const normalized = text.trim().length === 0 ? null : text
  const patch = { [COLUMN_FOR_FIELD[field]]: normalized } as Partial<
    typeof characters.$inferInsert
  >

  const result = await bumpCharacterVersionGuarded(
    db,
    characterId,
    EDIT_SURFACE_CLASS.identityTraits,
    expectedVersion,
    patch
  )
  if (!result.ok) return result

  return ok({ version: result.value.version })
}
