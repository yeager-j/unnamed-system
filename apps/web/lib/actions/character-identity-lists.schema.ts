import { z } from "zod/v4"

import {
  IDENTITY_LIST_FIELDS,
  type CharacterIdentityListPersistenceError,
} from "@/lib/db/character-identity-lists"

/**
 * Input schema for {@link updateCharacterIdentityListAction}. The `field`
 * discriminator selects which of the five Step-4 Identity columns to write
 * — one action with a discriminator keeps the wire shape consistent and
 * avoids a one-action-per-field sprawl. Structural parent: the Step-3
 * narrative action.
 */
export const UpdateCharacterIdentityListSchema = z.object({
  characterId: z.string().min(1),
  field: z.enum(IDENTITY_LIST_FIELDS),
  text: z.string().max(8000),
  expectedVersion: z.number().int().nonnegative(),
})

export type UpdateCharacterIdentityListInput = z.input<
  typeof UpdateCharacterIdentityListSchema
>

export type UpdateCharacterIdentityListError =
  | "invalid-input"
  | CharacterIdentityListPersistenceError
