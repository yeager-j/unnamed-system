import { z } from "zod/v4"

import { getArchetype } from "@workspace/game/archetypes"

import type {
  RankUpArchetypeError,
  UnlockArchetypeError,
} from "@/lib/db/writes/archetype-ranks"

import { characterMutationBase } from "./character-mutation.schema"

/**
 * Input schemas for the Lineage Atlas write actions (UNN-239).
 *
 * `archetypeKey` is validated against the **runtime** catalog (`getArchetype`)
 * rather than a static `z.enum`, so it accepts any shipped Archetype — and demo
 * Archetypes when those are enabled — while still rejecting a tampered key that
 * resolves to nothing. (The write re-checks defensively.)
 */
export const UnlockArchetypeSchema = characterMutationBase.extend({
  archetypeKey: z.string().refine((key) => getArchetype(key) !== undefined, {
    message: "Unknown Archetype",
  }),
})

export const RankUpArchetypeSchema = characterMutationBase.extend({
  characterArchetypeId: z.string().min(1),
})

export type UnlockArchetypeInput = z.input<typeof UnlockArchetypeSchema>
export type RankUpArchetypeInput = z.input<typeof RankUpArchetypeSchema>

export type UnlockArchetypeActionError = "invalid-input" | UnlockArchetypeError
export type RankUpArchetypeActionError = "invalid-input" | RankUpArchetypeError
