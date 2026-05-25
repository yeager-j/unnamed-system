import { z } from "zod/v4"

import type { CharacterKnifePersistenceError } from "@/lib/db/character-knives"

/**
 * Input schemas for the Step-3 Knives actions. Each share `characterId` +
 * `expectedVersion` for the identity-class write surface; the per-action
 * bits diverge. Length bounds match the public sheet's render area.
 */

export const AddKnifeSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddKnifeInput = z.input<typeof AddKnifeSchema>

export const UpdateKnifeSchema = z.object({
  characterId: z.string().min(1),
  knifeId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateKnifeInput = z.input<typeof UpdateKnifeSchema>

export const RemoveKnifeSchema = z.object({
  characterId: z.string().min(1),
  knifeId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveKnifeInput = z.input<typeof RemoveKnifeSchema>

export type KnifeActionError = "invalid-input" | CharacterKnifePersistenceError
