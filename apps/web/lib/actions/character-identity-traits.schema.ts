import { z } from "zod/v4"

import {
  IDENTITY_TRAIT_FIELDS,
  type CharacterIdentityTraitPersistenceError,
} from "@/lib/db/character-identity-traits"

/**
 * Input schema for {@link updateCharacterIdentityTraitAction}. The `field`
 * discriminator selects which of the five Step-4 Identity columns to write
 * — one action with a discriminator keeps the wire shape consistent and
 * avoids a one-action-per-field sprawl. Structural parent: the Step-3
 * narrative action.
 */
export const UpdateCharacterIdentityTraitSchema = z.object({
  characterId: z.string().min(1),
  field: z.enum(IDENTITY_TRAIT_FIELDS),
  text: z.string().max(8000),
  expectedVersion: z.number().int().nonnegative(),
})

export type UpdateCharacterIdentityTraitInput = z.input<
  typeof UpdateCharacterIdentityTraitSchema
>

export type UpdateCharacterIdentityTraitError =
  | "invalid-input"
  | CharacterIdentityTraitPersistenceError
