import { z } from "zod/v4"

import type { CharacterTalentPersistenceError } from "@/lib/db/character-talents"
import { TALENT_KEYS } from "@/lib/game/talents"

/**
 * Input schemas for the player-added Talent picker. The `talentKey` is
 * validated against the canonical list, so a tampered payload bails before
 * the database round-trip; the persistence layer still re-validates as a
 * belt-and-braces measure.
 */

export const AddGainedTalentSchema = z.object({
  characterId: z.string().min(1),
  talentKey: z.enum(TALENT_KEYS),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddGainedTalentInput = z.input<typeof AddGainedTalentSchema>

export const RemoveGainedTalentSchema = z.object({
  characterId: z.string().min(1),
  talentKey: z.enum(TALENT_KEYS),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveGainedTalentInput = z.input<typeof RemoveGainedTalentSchema>

export type GainedTalentActionError =
  | "invalid-input"
  | CharacterTalentPersistenceError
