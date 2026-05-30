import { z } from "zod/v4"

import type { CharacterTalentPersistenceError } from "@/lib/db/writes/talents"
import { TALENT_KEYS } from "@/lib/game/character"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the player-added Talent picker. The `talentKey` is
 * validated against the canonical list, so a tampered payload bails before
 * the database round-trip; the persistence layer still re-validates as a
 * belt-and-braces measure.
 */

export const AddGainedTalentSchema = characterMutationBase.extend({
  talentKey: z.enum(TALENT_KEYS),
})
export type AddGainedTalentInput = z.input<typeof AddGainedTalentSchema>

export const RemoveGainedTalentSchema = characterMutationBase.extend({
  talentKey: z.enum(TALENT_KEYS),
})
export type RemoveGainedTalentInput = z.input<typeof RemoveGainedTalentSchema>

export type GainedTalentActionError =
  | "invalid-input"
  | CharacterTalentPersistenceError
