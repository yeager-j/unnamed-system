import { z } from "zod/v4"

import type { ActiveArchetypePersistenceError } from "@/lib/db/writes/active-archetype"

/**
 * Input schema for the owner-mode "Switch Active Archetype" action (PRD §6.1,
 * UNN-238). Targets the `identityVersion` write class — the same token
 * `setOriginArchetype` and the name/notes edits bump — since the active
 * Archetype pointer lives in the identity slice.
 */
const characterMutationBase = z.object({
  characterId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})

export const SetActiveArchetypeSchema = characterMutationBase.extend({
  characterArchetypeId: z.string().min(1),
})
export type SetActiveArchetypeInput = z.input<typeof SetActiveArchetypeSchema>

export type SetActiveArchetypeError =
  | "invalid-input"
  | ActiveArchetypePersistenceError
