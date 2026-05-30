import { z } from "zod/v4"

import type { CharacterNarrativePersistenceError } from "@/lib/db/writes/narrative"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schema for {@link updateCharacterNarrativeAction}. The `field`
 * discriminator selects which of the three Step-3 free-text columns to
 * write — wrapping all three in one action keeps the wire shape consistent
 * and avoids a one-action-per-field sprawl.
 *
 * Length caps are advisory display limits, sized so the public sheet can
 * render them without scrolling pathologies. Ancestry & Background are
 * single-line in the builder; Backstory is the long-form Markdown field.
 */
export const UpdateCharacterNarrativeSchema = characterMutationBase.extend({
  field: z.enum(["ancestry", "background", "backstory"]),
  text: z.string().max(8000),
})

export type UpdateCharacterNarrativeInput = z.input<
  typeof UpdateCharacterNarrativeSchema
>

export type UpdateCharacterNarrativeError =
  | "invalid-input"
  | CharacterNarrativePersistenceError
