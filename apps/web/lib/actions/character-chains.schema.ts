import { z } from "zod/v4"

import type { CharacterChainPersistenceError } from "@/lib/db/character-chains"

/**
 * Input schemas for the Step-3 Chains actions. Mirrors the Knives shape;
 * see `character-knives.schema.ts` for the rationale on the parallel files.
 */

export const AddChainSchema = z.object({
  characterId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type AddChainInput = z.input<typeof AddChainSchema>

export const UpdateChainSchema = z.object({
  characterId: z.string().min(1),
  chainId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().max(4000).optional(),
  expectedVersion: z.number().int().nonnegative(),
})
export type UpdateChainInput = z.input<typeof UpdateChainSchema>

export const RemoveChainSchema = z.object({
  characterId: z.string().min(1),
  chainId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
})
export type RemoveChainInput = z.input<typeof RemoveChainSchema>

export type ChainActionError = "invalid-input" | CharacterChainPersistenceError
