import { z } from "zod/v4"

import {
  IDENTITY_TRAIT_FIELDS,
  type CharacterIdentityTraitPersistenceError,
} from "@/lib/db/writes/identity-traits"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schema for {@link updateCharacterIdentityTraitAction}. The `field`
 * discriminator selects which of the five Step-4 Identity columns to write
 * — one action with a discriminator keeps the wire shape consistent and
 * avoids a one-action-per-field sprawl. Structural parent: the Step-3
 * narrative action.
 */
export const UpdateCharacterIdentityTraitSchema = characterMutationBase.extend({
  field: z.enum(IDENTITY_TRAIT_FIELDS),
  text: z.string().max(8000),
})

export type UpdateCharacterIdentityTraitInput = z.input<
  typeof UpdateCharacterIdentityTraitSchema
>

export type UpdateCharacterIdentityTraitError =
  | "invalid-input"
  | CharacterIdentityTraitPersistenceError
