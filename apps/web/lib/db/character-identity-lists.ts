import { and, eq, sql } from "drizzle-orm"

import { err, ok, type Result } from "../game/result"
import { db } from "./index"
import { characterExists } from "./load-character"
import { characters } from "./schema/character"

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

export type CharacterIdentityListPersistenceError =
  | "character-not-found"
  | "stale"

export interface CharacterIdentityListPersistenceSuccess {
  version: number
}

export const IDENTITY_LIST_FIELDS = [
  "personality",
  "hope",
  "dream",
  "fear",
  "secret",
] as const

export type IdentityListField = (typeof IDENTITY_LIST_FIELDS)[number]

const COLUMN_FOR_FIELD = {
  personality: "personalityTraits",
  hope: "hopes",
  dream: "dreams",
  fear: "fears",
  secret: "secrets",
} as const satisfies Record<
  IdentityListField,
  keyof typeof characters.$inferInsert
>

export async function updateCharacterIdentityList(
  characterId: string,
  field: IdentityListField,
  text: string,
  expectedVersion: number
): Promise<
  Result<
    CharacterIdentityListPersistenceSuccess,
    CharacterIdentityListPersistenceError
  >
> {
  const normalized = text.trim().length === 0 ? null : text
  const patch = { [COLUMN_FOR_FIELD[field]]: normalized } as Partial<
    typeof characters.$inferInsert
  >

  const updated = await db
    .update(characters)
    .set({
      ...patch,
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

  if (updated.length === 0) {
    return (await characterExists(characterId))
      ? err("stale")
      : err("character-not-found")
  }

  return ok({ version: updated[0]!.identityVersion })
}
